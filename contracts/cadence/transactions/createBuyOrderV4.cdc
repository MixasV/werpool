import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import OrderBookV4 from 0x3ea7ac2bcdd8bcef

// Create buy order - user wants to buy outcome tokens
// Pays price * size FLOW collateral, escrowed in OrderBook until filled or canceled
// Example: buy 100 YES tokens at 0.65 price → pays 65 FLOW
transaction(marketId: UInt64, outcomeIndex: Int, price: UFix64, size: UFix64) {
    
    let makerAddress: Address
    let flowVaultRef: auth(FungibleToken.Withdraw) &FlowToken.Vault
    
    prepare(signer: auth(Storage) &Account) {
        self.makerAddress = signer.address
        
        // Get reference to user's Flow vault
        self.flowVaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("could not borrow Flow vault reference")
    }
    
    execute {
        // Calculate required collateral: price * size
        let requiredCollateral = price * size
        
        // Withdraw collateral from user's Flow vault
        let collateral <- self.flowVaultRef.withdraw(amount: requiredCollateral)
        
        // Create buy order (collateral will be escrowed in OrderBook)
        let orderId = OrderBookV4.createBuyOrder(
            marketId: marketId,
            outcomeIndex: outcomeIndex,
            maker: self.makerAddress,
            price: price,
            size: size,
            collateral: <-collateral
        )
        
        log("Buy order created: ".concat(orderId.toString()))
    }
}
