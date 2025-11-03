import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import SealedBettingV4 from 0x3ea7ac2bcdd8bcef

// Reveal sealed bet - manual reveal anytime
// User provides outcome and salt to prove their original commitment
// After reveal, user can claim payout if they won
transaction(betId: UInt64, outcomeIndex: Int, salt: String) {
    
    prepare(signer: auth(Storage) &Account) {
        // Reveal sealed bet
        SealedBettingV4.revealBet(
            betId: betId,
            revealer: signer.address,
            outcomeIndex: outcomeIndex,
            salt: salt
        )
        
        log("Sealed bet revealed: betId=".concat(betId.toString()).concat(", outcome=").concat(outcomeIndex.toString()))
        log("You can now claim payout if you won")
    }
}
