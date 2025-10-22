/**
 * Place Bet with JUICE Tokens
 * 
 * Testnet Contract: 0xf8ba321af4bd37bb.aiSportsJuice
 * 
 * This transaction allows users to bet JUICE tokens on prediction market outcomes.
 * Based on Flow FungibleToken standard pattern.
 */

import FungibleToken from 0x9a0766d93b6608b7
import aiSportsJuice from 0xf8ba321af4bd37bb

transaction(marketId: String, outcome: String, amount: UFix64) {
    
    let sentVault: @{FungibleToken.Vault}
    let signerAddress: Address
    
    prepare(signer: &Account) {
        self.signerAddress = signer.address
        
        // Get reference to the signer's JUICE vault
        let vaultRef = signer.storage.borrow<&aiSportsJuice.Vault>(
            from: /storage/aiSportsJuiceVault
        ) ?? panic("Could not borrow reference to JUICE Vault!")

        // Withdraw JUICE tokens for the bet
        self.sentVault <- vaultRef.withdraw(amount: amount)
    }

    execute {
        // In production: transfer to market contract/escrow
        // For now: destroy vault (placeholder - needs market contract integration)
        destroy self.sentVault
        
        // Emit bet event
        log("Bet placed: market=".concat(marketId)
            .concat(" outcome=").concat(outcome)
            .concat(" amount=").concat(amount.toString())
            .concat(" signer=").concat(self.signerAddress.toString()))
    }
}
