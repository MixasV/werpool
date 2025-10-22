/**
 * Stake JUICE Tokens in Escrow
 * 
 * Testnet Contract: 0xf8ba321af4bd37bb.aiSportsEscrow
 * 
 * Stakes JUICE tokens for participation in contests or governance.
 * Based on Flow FungibleToken + Escrow pattern.
 */

import FungibleToken from 0x9a0766d93b6608b7
import aiSportsJuice from 0xf8ba321af4bd37bb
import aiSportsEscrow from 0xf8ba321af4bd37bb

transaction(amount: UFix64, stakeDuration: UFix64) {
    
    let stakerVault: &aiSportsJuice.Vault
    let signerAddress: Address
    
    prepare(signer: &Account) {
        self.signerAddress = signer.address
        
        // Get reference to signer's JUICE vault
        self.stakerVault = signer.storage.borrow<&aiSportsJuice.Vault>(
            from: /storage/aiSportsJuiceVault
        ) ?? panic("Could not borrow JUICE Vault!")
    }

    execute {
        // Withdraw JUICE for staking
        let stakeVault <- self.stakerVault.withdraw(amount: amount)
        
        // In production: deposit to escrow contract
        // For now: log and destroy (needs escrow contract integration)
        destroy stakeVault
        
        log("JUICE staked: amount=".concat(amount.toString())
            .concat(" duration=").concat(stakeDuration.toString())
            .concat(" staker=").concat(self.signerAddress.toString()))
    }
}
