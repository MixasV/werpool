import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import CoreMarketContractV4 from 0x3ea7ac2bcdd8bcef
import OutcomeTokenV4 from 0x3ea7ac2bcdd8bcef
import OrderBookV4 from 0x3ea7ac2bcdd8bcef

// SELL OUTCOME DIRECTLY: Sell outcome tokens for FLOW
// User sells outcome tokens by creating sell order in order book
// More straightforward than buyOutcomeDirectly as no split/merge needed
//
// Example: Have 100 YES tokens
// - Create sell order for 100 YES at sellPrice
// - When filled, receive FLOW
transaction(
    marketId: UInt64,
    outcomeIndex: Int,
    sharesAmount: UFix64,
    minPrice: UFix64
) {
    
    let userAddress: Address
    
    prepare(signer: auth(Storage) &Account) {
        self.userAddress = signer.address
        
        // Generate storage path for outcome tokens
        let suffix = marketId.toString().concat("_").concat(outcomeIndex.toString())
        let storagePath = StoragePath(identifier: "forte_outcomeToken_".concat(suffix))!
        
        // Borrow outcome vault
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(
            from: storagePath
        ) ?? panic("could not borrow outcome vault - ensure you have outcome tokens")
        
        // Verify user has enough shares
        if vaultRef.balance < sharesAmount {
            panic("insufficient outcome tokens: have ".concat(vaultRef.balance.toString()).concat(", need ").concat(sharesAmount.toString()))
        }
        
        // Withdraw shares to sell
        let shares <- vaultRef.withdraw(amount: sharesAmount)
        
        // Create sell order at minPrice (user wants at least this price)
        let orderId = OrderBookV4.createSellOrder(
            marketId: marketId,
            outcomeIndex: outcomeIndex,
            maker: self.userAddress,
            price: minPrice,
            size: sharesAmount,
            shares: <-shares
        )
        
        log("Sell order created: orderId=".concat(orderId.toString()).concat(", outcome=").concat(outcomeIndex.toString()).concat(", size=").concat(sharesAmount.toString()).concat(", price=").concat(minPrice.toString()))
    }
}
