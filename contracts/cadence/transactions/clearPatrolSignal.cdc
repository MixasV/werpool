import CoreMarketHub from "CoreMarketHub"

transaction(marketId: UInt64, patrolAddress: Address) {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        let operatorBadge = signer.storage.borrow<&CoreMarketHub.RoleBadge>(
            from: CoreMarketHub.roleStoragePath(role: CoreMarketHub.Role.operator)
        )
        let adminBadge = signer.storage.borrow<&CoreMarketHub.RoleBadge>(
            from: CoreMarketHub.roleStoragePath(role: CoreMarketHub.Role.admin)
        )
        let patrolBadge = signer.storage.borrow<&CoreMarketHub.RoleBadge>(
            from: CoreMarketHub.roleStoragePath(role: CoreMarketHub.Role.patrol)
        )

        let badge = operatorBadge ?? adminBadge ?? patrolBadge
            ?? panic("role badge is required to clear patrol signal")

        CoreMarketHub.clearPatrolSignal(
            executorBadge: badge,
            id: marketId,
            patrolAddress: patrolAddress
        )
    }
}
