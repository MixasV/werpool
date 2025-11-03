import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import CoreMarketContractV4 from 0x3ea7ac2bcdd8bcef
import OutcomeTokenV4 from 0x3ea7ac2bcdd8bcef
import OrderBookV4 from 0x3ea7ac2bcdd8bcef

// ONE-CLICK BUY: Buy specific outcome directly
// Composite operation:
// 1. Split FLOW collateral → all outcome tokens
// 2. Keep desired outcome
// 3. Sell other outcomes via order book
//
// Example: Want 100 YES tokens, market has 2 outcomes (YES, NO)
// - Split 100 FLOW → 100 YES + 100 NO
// - Keep 100 YES
// - Create sell order for 100 NO at sellPrice
//
// User gets desired outcome, unwanted outcomes are listed for sale
transaction(
    marketId: UInt64,
    desiredOutcomeIndex: Int,
    collateralAmount: UFix64,
    sellPrice: UFix64,
    outcomeCount: Int
) {
    
    prepare(signer: auth(Storage, Capabilities) &Account) {
        // Get reference to user's Flow vault
        let flowVaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("could not borrow Flow vault reference")
        
        // Step 1: Withdraw collateral
        let collateral <- flowVaultRef.withdraw(amount: collateralAmount)
        
        // Step 2: Split position - get all outcome tokens
        let outcomeVaults <- CoreMarketContractV4.splitPosition(
            marketId: marketId,
            user: signer.address,
            collateral: <-collateral
        )
        
        // Step 3: Process each outcome
        for outcomeIndex in outcomeVaults.keys {
            let vault <- outcomeVaults.remove(key: outcomeIndex)!
            
            if outcomeIndex == desiredOutcomeIndex {
                // This is the desired outcome - store it
                let suffix = marketId.toString().concat("_").concat(outcomeIndex.toString())
                let storagePath = StoragePath(identifier: "forte_outcomeToken_".concat(suffix))!
                let receiverPath = PublicPath(identifier: "forte_outcomeReceiver_".concat(suffix))!
                let balancePath = PublicPath(identifier: "forte_outcomeBalance_".concat(suffix))!
                
                if let existingVaultRef = signer.storage.borrow<&{FungibleToken.Vault}>(from: storagePath) {
                    existingVaultRef.deposit(from: <-vault)
                } else {
                    signer.storage.save(<-vault, to: storagePath)
                    
                    let receiverCap = signer.capabilities.storage.issue<&{FungibleToken.Receiver}>(storagePath)
                    signer.capabilities.publish(receiverCap, at: receiverPath)
                    
                    let balanceCap = signer.capabilities.storage.issue<&{FungibleToken.Balance}>(storagePath)
                    signer.capabilities.publish(balanceCap, at: balancePath)
                }
                
                log("Kept desired outcome: ".concat(outcomeIndex.toString()).concat(", amount: ").concat(collateralAmount.toString()))
            } else {
                // This is unwanted outcome - create sell order
                let orderId = OrderBookV4.createSellOrder(
                    marketId: marketId,
                    outcomeIndex: outcomeIndex,
                    maker: signer.address,
                    price: sellPrice,
                    size: collateralAmount,
                    shares: <-vault
                )
                
                log("Created sell order for outcome: ".concat(outcomeIndex.toString()).concat(", orderId: ").concat(orderId.toString()))
            }
        }
        
        destroy outcomeVaults
        
        log("Buy outcome directly completed: kept outcome ".concat(desiredOutcomeIndex.toString()))
    }
}
