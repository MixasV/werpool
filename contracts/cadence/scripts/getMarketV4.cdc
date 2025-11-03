import CoreMarketContractV4 from 0x3ea7ac2bcdd8bcef

// Get market data by ID
// Returns market struct with all information
access(all) fun main(marketId: UInt64): CoreMarketContractV4.Market? {
    return CoreMarketContractV4.getMarket(marketId: marketId)
}
