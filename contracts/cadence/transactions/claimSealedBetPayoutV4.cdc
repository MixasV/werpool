import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import SealedBettingV4 from 0x3ea7ac2bcdd8bcef

// Claim payout from winning sealed bet
// Must be revealed first and market must be settled
// If bet won, receive collateral amount (1:1)
transaction(betId: UInt64) {
    
    let claimerAddress: Address
    let flowReceiverRef: &{FungibleToken.Receiver}
    
    prepare(signer: auth(Capabilities) &Account) {
        self.claimerAddress = signer.address
        
        // Get reference to user's Flow receiver
        self.flowReceiverRef = signer.capabilities.borrow<&{FungibleToken.Receiver}>(
            /public/flowTokenReceiver
        ) ?? panic("could not borrow Flow receiver reference")
    }
    
    execute {
        // Claim payout (returns collateral if won, panics if lost)
        let payout <- SealedBettingV4.claimPayout(
            betId: betId,
            claimer: self.claimerAddress
        )
        
        let amount = payout.balance
        
        // Deposit payout to user's Flow vault
        self.flowReceiverRef.deposit(from: <-payout)
        
        log("Payout claimed: betId=".concat(betId.toString()).concat(", amount=").concat(amount.toString()))
    }
}
