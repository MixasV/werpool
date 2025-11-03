import OrderBookV4 from 0x3ea7ac2bcdd8bcef

// Get order book for specific market and outcome
// Returns dictionary with buy and sell orders
access(all) fun main(marketId: UInt64, outcomeIndex: Int): {String: [OrderBookV4.Order]} {
    return OrderBookV4.getOrderBook(marketId: marketId, outcomeIndex: outcomeIndex)
}
