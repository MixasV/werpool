import CoreMarketHub from "CoreMarketHub"
import LMSRAmm from "LMSRAmm"
import OutcomeToken from "OutcomeToken"
import FungibleToken from "FungibleToken"
import FlowToken from "FlowToken"

transaction(
    marketId: UInt64,
    outcomeCount: Int,
    liquidityParameter: UFix64,
    seedAmount: UFix64
) {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        let rolePath = CoreMarketHub.roleStoragePath(role: CoreMarketHub.Role.operator)
        let badge = signer.storage.borrow<&CoreMarketHub.RoleBadge>(from: rolePath)
            ?? panic("operator role badge is required")

        let withdrawRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(from: /storage/testFlowTokenVault)
            ?? panic("missing FlowToken vault reference")

        let seedVault <- withdrawRef.withdraw(amount: seedAmount) as @{FungibleToken.Vault}

        let marketPool <- LMSRAmm.createMarketPool(
            marketId: marketId,
            outcomeCount: outcomeCount,
            liquidityParameter: liquidityParameter,
            seedVault: <-seedVault
        )

        let suffix = marketId.toString()
        let poolStorage = StoragePath(identifier: "forte_marketPool_".concat(suffix))!
        if signer.storage.borrow<&LMSRAmm.MarketPool>(from: poolStorage) != nil {
            panic("market pool already initialized")
        }
        signer.storage.save(<-marketPool, to: poolStorage)

        let poolReceiverPath = PublicPath(identifier: "/public/forte_marketPoolReceiver_".concat(suffix))!
        let poolProviderPath = PublicPath(identifier: "/public/forte_marketPoolProvider_".concat(suffix))!

        signer.capabilities.unpublish(poolReceiverPath)
        signer.capabilities.unpublish(poolProviderPath)

        let receiverCapability = signer.capabilities.storage.issue<&{LMSRAmm.PoolReceiver}>(poolStorage)
        signer.capabilities.publish(receiverCapability, at: poolReceiverPath)

        let providerCapability = signer.capabilities.storage.issue<&{LMSRAmm.PoolProvider}>(poolStorage)
        signer.capabilities.publish(providerCapability, at: poolProviderPath)

        OutcomeToken.linkVault(account: signer, marketId: marketId)

        CoreMarketHub.setMarketStorage(
            operatorBadge: badge,
            id: marketId,
            liquidityPoolPath: poolStorage,
            outcomeVaultPath: StoragePath(identifier: "forte_outcomeVault_".concat(suffix))!,
            liquidityReceiverPath: poolReceiverPath,
            liquidityProviderPath: poolProviderPath,
            outcomeReceiverPath: PublicPath(identifier: "/public/forte_outcomeReceiver_".concat(suffix))!,
            outcomeBalancePath: PublicPath(identifier: "/public/forte_outcomeBalance_".concat(suffix))!,
            outcomeProviderPath: PublicPath(identifier: "/public/forte_outcomeProvider_".concat(suffix))!
        )
    }
}
