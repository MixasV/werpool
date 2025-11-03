import OrderBookV4 from 0x3ea7ac2bcdd8bcef

// Get effective buy and sell prices for an outcome
// Returns best available prices in the order book
access(all) fun main(marketId: UInt64, outcomeIndex: Int): {String: UFix64} {
    let buyPrice = OrderBookV4.getEffectiveBuyPrice(
        marketId: marketId,
        desiredOutcomeIndex: outcomeIndex
    )
    
    let sellPrice = OrderBookV4.getEffectiveSellPrice(
        marketId: marketId,
        outcomeToSell: outcomeIndex
    )
    
    return {
        "buyPrice": buyPrice,
        "sellPrice": sellPrice
    }
}
