/**
 * Transfer JUICE Tokens
 * 
 * Testnet Contract: 0xf8ba321af4bd37bb.aiSportsJuice
 * 
 * Based on Flow FungibleToken standard.
 * Contract verified on testnet (225 LOC).
 */

import FungibleToken from 0x9a0766d93b6608b7
import aiSportsJuice from 0xf8ba321af4bd37bb

transaction(recipient: Address, amount: UFix64) {
    
    let sentVault: @{FungibleToken.Vault}
    
    prepare(signer: &Account) {
        // Get reference to signer's JUICE vault
        let vaultRef = signer.storage.borrow<&aiSportsJuice.Vault>(
            from: /storage/aiSportsJuiceVault
        ) ?? panic("Could not borrow reference to JUICE Vault!")

        // Withdraw tokens
        self.sentVault <- vaultRef.withdraw(amount: amount)
    }

    execute {
        // Get recipient's account
        let recipientAccount = getAccount(recipient)

        // Get recipient's JUICE receiver
        let receiverRef = recipientAccount.capabilities
            .borrow<&{FungibleToken.Receiver}>(/public/aiSportsJuiceReceiver)
            ?? panic("Could not borrow JUICE Receiver capability!")

        // Deposit tokens
        receiverRef.deposit(from: <-self.sentVault)
    }
}
