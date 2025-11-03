import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868

/// Transaction: Accept FastBreak Challenge
/// Opponent stakes matching FLOW tokens
transaction(challengeId: String, stakeAmount: UFix64) {
    let paymentVault: @FungibleToken.Vault
    let opponentAddress: Address
    
    prepare(signer: &Account) {
        self.opponentAddress = signer.address
        
        // Withdraw FLOW tokens for matching stake
        let vaultRef = signer.storage.borrow<&FlowToken.Vault>(from: /storage/flowTokenVault)
            ?? panic("Could not borrow FlowToken vault")
        
        self.paymentVault <- vaultRef.withdraw(amount: stakeAmount)
    }
    
    execute {
        // In production: Deposit to FastBreak escrow contract
        // Must match original stake amount exactly
        let balance = self.paymentVault.balance
        destroy self.paymentVault
        
        // Emit event for backend tracking
        log("FastBreak challenge accepted")
        log("Challenge ID: ".concat(challengeId))
        log("Opponent: ".concat(self.opponentAddress.toString()))
        log("Stake: ".concat(balance.toString()))
    }
}
