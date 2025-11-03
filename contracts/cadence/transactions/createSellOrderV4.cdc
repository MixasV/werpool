import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import OrderBookV4 from 0x3ea7ac2bcdd8bcef
import OutcomeTokenV4 from 0x3ea7ac2bcdd8bcef

// Create sell order - user wants to sell outcome tokens
// User must have outcome tokens in storage, they will be escrowed until filled or canceled
// Example: sell 100 YES tokens at 0.65 price → receive 65 FLOW when filled
transaction(marketId: UInt64, outcomeIndex: Int, price: UFix64, size: UFix64) {
    
    let makerAddress: Address
    
    prepare(signer: auth(Storage) &Account) {
        self.makerAddress = signer.address
        
        // Generate storage path for outcome tokens
        let suffix = marketId.toString().concat("_").concat(outcomeIndex.toString())
        let storagePath = StoragePath(identifier: "forte_outcomeToken_".concat(suffix))!
        
        // Borrow outcome vault
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(
            from: storagePath
        ) ?? panic("could not borrow outcome vault - ensure you have outcome tokens")
        
        // Withdraw shares to sell
        let shares <- vaultRef.withdraw(amount: size)
        
        // Create sell order (shares will be escrowed in OrderBook)
        let orderId = OrderBookV4.createSellOrder(
            marketId: marketId,
            outcomeIndex: outcomeIndex,
            maker: self.makerAddress,
            price: price,
            size: size,
            shares: <-shares
        )
        
        log("Sell order created: ".concat(orderId.toString()))
    }
}
