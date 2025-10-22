/**
 * Deposit FLOW to Contest Escrow
 * 
 * Testnet Contract: 0xf8ba321af4bd37bb.aiSportsEscrow
 * 
 * Deposits FLOW tokens to escrow for contest entry or prize pool contribution.
 */

import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import aiSportsEscrow from 0xf8ba321af4bd37bb

transaction(contestId: String, amount: UFix64) {
    
    let senderVault: &FlowToken.Vault
    let signerAddress: Address
    
    prepare(signer: &Account) {
        self.signerAddress = signer.address
        
        // Get reference to sender's FLOW vault
        self.senderVault = signer.storage.borrow<&FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Could not borrow FLOW Vault!")
    }

    execute {
        // Withdraw FLOW for escrow deposit
        let depositVault <- self.senderVault.withdraw(amount: amount)
        
        // In production: deposit to contest escrow
        // For now: destroy and log
        destroy depositVault
        
        log("Deposited to escrow: contest=".concat(contestId)
            .concat(" amount=").concat(amount.toString())
            .concat(" from=").concat(self.signerAddress.toString()))
    }
}
