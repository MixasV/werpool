import CoreMarketHub from "CoreMarketHub"

access(all) fun main(marketId: UInt64): {String: AnyStruct}? {
    if let metadata = CoreMarketHub.getMarketStorageMetadata(id: marketId) {
        return {
            "liquidityPoolPath": metadata.liquidityPoolPath.toString(),
            "outcomeVaultPath": metadata.outcomeVaultPath.toString(),
            "liquidityReceiverPath": metadata.liquidityReceiverPath.toString(),
            "liquidityProviderPath": metadata.liquidityProviderPath.toString(),
            "outcomeReceiverPath": metadata.outcomeReceiverPath.toString(),
            "outcomeBalancePath": metadata.outcomeBalancePath.toString(),
            "outcomeProviderPath": metadata.outcomeProviderPath.toString(),
            "owner": metadata.owner
        }
    }
    return nil
}
