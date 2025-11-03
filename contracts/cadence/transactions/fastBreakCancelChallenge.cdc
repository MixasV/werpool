import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868

/// Transaction: Cancel FastBreak Challenge
/// Creator cancels and gets refund if no opponent joined
transaction(challengeId: String, refundAmount: UFix64) {
    let receiverRef: &{FungibleToken.Receiver}
    let creatorAddress: Address
    
    prepare(signer: &Account) {
        self.creatorAddress = signer.address
        
        // Get receiver capability for refund
        self.receiverRef = signer.capabilities
            .get<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
            .borrow()
            ?? panic("Could not borrow FlowToken receiver")
    }
    
    execute {
        // In production: Refund from escrow contract
        // For now: Log cancellation (backend processes refund)
        log("FastBreak challenge cancelled")
        log("Challenge ID: ".concat(challengeId))
        log("Creator: ".concat(self.creatorAddress.toString()))
        log("Refund: ".concat(refundAmount.toString()))
    }
}
