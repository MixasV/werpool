import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import SealedBettingV4 from 0x3ea7ac2bcdd8bcef
import FlowTransactionScheduler from 0x3ea7ac2bcdd8bcef
import MetadataViews from 0x1d7e57aa55817448

// AutoRevealHandler: Scheduled transaction handler for auto-revealing sealed bets
// This resource implements FlowTransactionScheduler.TransactionHandler
// and is called automatically after 30 days to reveal committed sealed bets
access(all) contract AutoRevealHandler {

    access(all) let HandlerStoragePath: StoragePath
    access(all) let HandlerPublicPath: PublicPath

    access(all) event HandlerCreated(owner: Address)
    access(all) event AutoRevealExecuted(betId: UInt64, success: Bool, error: String?)

    // Handler resource that executes auto-reveal logic
    access(all) resource Handler: FlowTransactionScheduler.TransactionHandler {
        
        // Called by Flow blockchain when scheduled time arrives
        access(FlowTransactionScheduler.Execute)
        fun executeTransaction(id: UInt64, data: AnyStruct?) {
            // Extract bet ID from data
            if let dataDict = data as? {String: AnyStruct} {
                if let betIdValue = dataDict["betId"] {
                    if let betId = betIdValue as? UInt64 {
                        self.autoRevealBet(betId: betId)
                        return
                    }
                }
            }
            
            // Fallback: try to parse data as UInt64 directly
            if let betId = data as? UInt64 {
                self.autoRevealBet(betId: betId)
                return
            }
            
            log("Invalid data format for AutoRevealHandler")
        }
        
        // Auto-reveal logic
        access(self) fun autoRevealBet(betId: UInt64) {
            var success = false
            var errorMsg: String? = nil
            
            // Get bet info
            let bet = SealedBettingV4.getBet(betId: betId)
            if bet == nil {
                errorMsg = "Bet not found"
                emit AutoRevealExecuted(betId: betId, success: false, error: errorMsg)
                return
            }
            
            // Check if already revealed
            if bet!.status != SealedBettingV4.SealedBetStatus.committed {
                log("Bet already revealed, skipping")
                emit AutoRevealExecuted(betId: betId, success: true, error: nil)
                return
            }
            
            // Auto-reveal
            SealedBettingV4.autoRevealBet(betId: betId)
            log("Auto-revealed sealed bet: ".concat(betId.toString()))
            
            // Auto-claim payout
            let payout <- SealedBettingV4.autoClaimPayout(betId: betId)
            
            if payout.balance > 0.0 {
                // Winner! Send to bettor
                let bettorAccount = getAccount(bet!.bettor)
                let receiverRef = bettorAccount.capabilities
                    .borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
                
                if receiverRef != nil {
                    let amount = payout.balance
                    receiverRef!.deposit(from: <-payout)
                    log("Auto-claimed and sent ".concat(amount.toString()).concat(" FLOW"))
                    success = true
                } else {
                    // Can't send, destroy payout (edge case)
                    errorMsg = "Could not borrow receiver for bettor"
                    destroy payout
                }
            } else {
                // Loser, no payout
                destroy payout
                success = true
                log("Bet lost, no payout")
            }
            
            emit AutoRevealExecuted(betId: betId, success: success, error: errorMsg)
        }
        
        // Metadata views implementation
        access(all) view fun getViews(): [Type] {
            return [
                Type<StoragePath>(),
                Type<PublicPath>(),
                Type<MetadataViews.Display>()
            ]
        }
        
        access(all) fun resolveView(_ view: Type): AnyStruct? {
            switch view {
                case Type<StoragePath>():
                    return AutoRevealHandler.HandlerStoragePath
                    
                case Type<PublicPath>():
                    return AutoRevealHandler.HandlerPublicPath
                    
                case Type<MetadataViews.Display>():
                    return MetadataViews.Display(
                        name: "Auto-Reveal Sealed Bet Handler",
                        description: "Automatically reveals and claims sealed bets after 30 days if user forgot to reveal manually",
                        thumbnail: MetadataViews.HTTPFile(
                            url: "https://werpool.io/icons/auto-reveal.svg"
                        )
                    )
                    
                default:
                    return nil
            }
        }
    }
    
    // Create a new handler instance
    access(all) fun createHandler(): @Handler {
        return <- create Handler()
    }
    
    init() {
        self.HandlerStoragePath = /storage/autoRevealHandler
        self.HandlerPublicPath = /public/autoRevealHandler
    }
}
