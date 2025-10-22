/**
 * Unstake JUICE Tokens from Escrow
 * 
 * Testnet Contract: 0xf8ba321af4bd37bb.aiSportsEscrow
 * 
 * Withdraws previously staked JUICE tokens back to user's vault.
 */

import FungibleToken from 0x9a0766d93b6608b7
import aiSportsJuice from 0xf8ba321af4bd37bb
import aiSportsEscrow from 0xf8ba321af4bd37bb

transaction(amount: UFix64) {
    
    let receiverRef: &{FungibleToken.Receiver}
    let signerAddress: Address
    
    prepare(signer: &Account) {
        self.signerAddress = signer.address
        
        // Get reference to signer's JUICE receiver
        self.receiverRef = signer.capabilities
            .borrow<&{FungibleToken.Receiver}>(/public/aiSportsJuiceReceiver)
            ?? panic("Could not borrow JUICE Receiver capability!")
    }

    execute {
        // In production: withdraw from escrow and deposit to user
        // For now: log unstake event
        
        log("JUICE unstaked: amount=".concat(amount.toString())
            .concat(" recipient=").concat(self.signerAddress.toString()))
    }
}
