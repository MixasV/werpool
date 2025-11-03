import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import CoreMarketContractV4 from 0x3ea7ac2bcdd8bcef
import OutcomeTokenV4 from 0x3ea7ac2bcdd8bcef

// Split FLOW collateral into complete set of outcome tokens
// User deposits collateralAmount FLOW and receives outcome tokens for each outcome
// Example: deposit 100 FLOW → receive 100 YES + 100 NO tokens
transaction(marketId: UInt64, collateralAmount: UFix64) {
    
    let userAddress: Address
    let flowVaultRef: auth(FungibleToken.Withdraw) &FlowToken.Vault
    
    prepare(signer: auth(Storage, Capabilities) &Account) {
        self.userAddress = signer.address
        
        // Get reference to user's Flow vault
        self.flowVaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("could not borrow Flow vault reference")
    }
    
    execute {
        // Withdraw collateral from user's Flow vault
        let collateral <- self.flowVaultRef.withdraw(amount: collateralAmount)
        
        // Split position - receive outcome tokens for all outcomes
        let outcomeVaults <- CoreMarketContractV4.splitPosition(
            marketId: marketId,
            user: self.userAddress,
            collateral: <-collateral
        )
        
        // Store outcome tokens in user's account
        // Each outcome gets its own vault in storage
        for outcomeIndex in outcomeVaults.keys {
            let vault <- outcomeVaults.remove(key: outcomeIndex)!
            
            // Generate storage path for this outcome
            let suffix = marketId.toString().concat("_").concat(outcomeIndex.toString())
            let storagePath = StoragePath(identifier: "forte_outcomeToken_".concat(suffix))!
            let receiverPath = PublicPath(identifier: "forte_outcomeReceiver_".concat(suffix))!
            let balancePath = PublicPath(identifier: "forte_outcomeBalance_".concat(suffix))!
            
            // Check if vault already exists in storage
            if let existingVaultRef = signer.storage.borrow<&{FungibleToken.Vault}>(from: storagePath) {
                // Deposit to existing vault
                existingVaultRef.deposit(from: <-vault)
            } else {
                // Save new vault to storage
                signer.storage.save(<-vault, to: storagePath)
                
                // Create public capabilities for receiving and balance checking
                let receiverCap = signer.capabilities.storage.issue<&{FungibleToken.Receiver}>(storagePath)
                signer.capabilities.publish(receiverCap, at: receiverPath)
                
                let balanceCap = signer.capabilities.storage.issue<&{FungibleToken.Balance}>(storagePath)
                signer.capabilities.publish(balanceCap, at: balancePath)
            }
        }
        
        destroy outcomeVaults
    }
}
