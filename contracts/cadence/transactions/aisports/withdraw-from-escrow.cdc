/**
 * Withdraw FLOW from Contest Escrow
 * 
 * Testnet Contract: 0xf8ba321af4bd37bb.aiSportsEscrow
 * 
 * Withdraws winnings or refunds from contest escrow back to user.
 */

import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import aiSportsEscrow from 0xf8ba321af4bd37bb

transaction(contestId: String, amount: UFix64) {
    
    let receiverRef: &{FungibleToken.Receiver}
    let signerAddress: Address
    
    prepare(signer: &Account) {
        self.signerAddress = signer.address
        
        // Get reference to recipient's FLOW receiver
        self.receiverRef = signer.capabilities
            .borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
            ?? panic("Could not borrow FLOW Receiver capability!")
    }

    execute {
        // In production: withdraw from escrow and deposit to user
        // For now: log withdrawal event
        
        log("Withdrawn from escrow: contest=".concat(contestId)
            .concat(" amount=").concat(amount.toString())
            .concat(" to=").concat(self.signerAddress.toString()))
    }
}
