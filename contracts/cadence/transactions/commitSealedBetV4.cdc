import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import SealedBettingV4 from 0x3ea7ac2bcdd8bcef

// Commit sealed bet - outcome hidden until reveal
// Platform generates salt and encrypts on-chain
// Auto-reveal scheduled for 30 days after market close
// NOTE: This transaction should be called by backend which provides salt
transaction(
    marketId: UInt64,
    outcomeIndex: Int,
    amount: UFix64,
    salt: String,
    autoRevealTxId: UInt64?,
    autoRevealScheduledFor: UFix64?
) {
    
    let bettorAddress: Address
    let flowVaultRef: auth(FungibleToken.Withdraw) &FlowToken.Vault
    
    prepare(signer: auth(Storage) &Account) {
        self.bettorAddress = signer.address
        
        // Get reference to user's Flow vault
        self.flowVaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("could not borrow Flow vault reference")
    }
    
    execute {
        // Withdraw collateral from user's Flow vault
        let collateral <- self.flowVaultRef.withdraw(amount: amount)
        
        // Commit sealed bet
        // Contract will hash the choice and encrypt outcome/salt
        let betId = SealedBettingV4.commitSealedBet(
            marketId: marketId,
            bettor: self.bettorAddress,
            outcomeIndex: outcomeIndex,
            collateral: <-collateral,
            salt: salt,
            autoRevealTxId: autoRevealTxId,
            autoRevealScheduledFor: autoRevealScheduledFor
        )
        
        log("Sealed bet committed: betId=".concat(betId.toString()))
        log("Outcome hidden until reveal: ".concat(autoRevealScheduledFor?.toString() ?? "manual"))
    }
}
