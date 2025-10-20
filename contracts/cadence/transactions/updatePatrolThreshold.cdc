import CoreMarketHub from "CoreMarketHub"

transaction(marketId: UInt64, newThreshold: UFix64) {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        let badge = signer.storage.borrow<&CoreMarketHub.RoleBadge>(
            from: CoreMarketHub.roleStoragePath(role: CoreMarketHub.Role.operator)
        ) ?? panic("operator role badge is required")

        CoreMarketHub.updatePatrolThreshold(
            operatorBadge: badge,
            id: marketId,
            newThreshold: newThreshold
        )
    }
}
