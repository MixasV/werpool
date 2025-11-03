import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868

/// Transaction: Claim FastBreak Winnings
/// Winner claims total prize pool (2x stake)
transaction(challengeId: String, winnerAddress: Address, prizeAmount: UFix64) {
    let receiverRef: &{FungibleToken.Receiver}
    
    prepare(signer: &Account) {
        // Verify signer is the winner
        assert(signer.address == winnerAddress, message: "Only winner can claim")
        
        // Get receiver capability
        self.receiverRef = signer.capabilities
            .get<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
            .borrow()
            ?? panic("Could not borrow FlowToken receiver")
    }
    
    execute {
        // In production: Withdraw from escrow contract and deposit to winner
        // For now: Log claim (backend will process payout)
        log("FastBreak winnings claimed")
        log("Challenge ID: ".concat(challengeId))
        log("Winner: ".concat(winnerAddress.toString()))
        log("Prize: ".concat(prizeAmount.toString()))
    }
}
