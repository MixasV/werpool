import LMSRAmm from "LMSRAmm"

access(all) fun main(marketId: UInt64): {String: AnyStruct}? {
    if let state = LMSRAmm.getPoolState(marketId: marketId) {
        return {
            "marketId": state.marketId,
            "bVector": state.bVector,
            "liquidityParameter": state.liquidityParameter,
            "totalLiquidity": state.totalLiquidity,
            "outcomeSupply": state.outcomeSupply
        }
    }
    return nil
}
