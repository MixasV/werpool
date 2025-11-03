import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import SealedBettingV4 from 0x3ea7ac2bcdd8bcef

// Auto-reveal sealed bet after 30 days
// Called by scheduled transaction or manually by admin
// Decrypts outcome, reveals, and auto-claims payout if won
transaction(betId: UInt64) {
    
    let receiverCap: Capability<&{FungibleToken.Receiver}>
    
    prepare(signer: &Account) {
        // Get receiver capability for depositing payout
        self.receiverCap = signer.capabilities.get<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
    }
    
    execute {
        // Get bet info before revealing
        let bet = SealedBettingV4.getBet(betId: betId)
            ?? panic("Sealed bet not found")
        
        // Check if already revealed
        if bet.status != SealedBettingV4.SealedBetStatus.committed {
            log("Bet already revealed or claimed, skipping")
            return
        }
        
        // Auto-reveal (platform decrypts and reveals)
        SealedBettingV4.autoRevealBet(betId: betId)
        log("Auto-revealed sealed bet: ".concat(betId.toString()))
        
        // Try to auto-claim payout
        let payout <- SealedBettingV4.autoClaimPayout(betId: betId)
        
        if payout.balance > 0.0 {
            // Winner! Send payout to bettor's account
            let bettorAccount = getAccount(bet.bettor)
            let receiverRef = bettorAccount.capabilities
                .borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
                ?? panic("Could not borrow receiver reference for bettor")
            
            let amount = payout.balance
            receiverRef.deposit(from: <-payout)
            
            log("Auto-claimed payout: ".concat(amount.toString()).concat(" FLOW to ").concat(bet.bettor.toString()))
        } else {
            // Loser, no payout
            destroy payout
            log("No payout (bet lost)")
        }
    }
    
    post {
        SealedBettingV4.getBet(betId: betId)!.status != SealedBettingV4.SealedBetStatus.committed:
            "Bet should be revealed after transaction"
    }
}
