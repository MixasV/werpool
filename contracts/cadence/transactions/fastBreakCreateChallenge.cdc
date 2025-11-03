import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868

/// Transaction: Create FastBreak Challenge
/// Stakes FLOW tokens in escrow for peer betting challenge
transaction(challengeId: String, stakeAmount: UFix64) {
    let paymentVault: @FungibleToken.Vault
    let creatorAddress: Address
    
    prepare(signer: &Account) {
        self.creatorAddress = signer.address
        
        // Withdraw FLOW tokens for stake
        let vaultRef = signer.storage.borrow<&FlowToken.Vault>(from: /storage/flowTokenVault)
            ?? panic("Could not borrow FlowToken vault")
        
        self.paymentVault <- vaultRef.withdraw(amount: stakeAmount)
    }
    
    execute {
        // In production: Deposit to FastBreak escrow contract
        // For now: Destroy (represents escrow)
        let balance = self.paymentVault.balance
        destroy self.paymentVault
        
        // Emit event for backend tracking
        log("FastBreak challenge created")
        log("Challenge ID: ".concat(challengeId))
        log("Creator: ".concat(self.creatorAddress.toString()))
        log("Stake: ".concat(balance.toString()))
    }
}
