import CoreMarketHub from "CoreMarketHub"

transaction(
    marketId: UInt64,
    reason: String,
    closedAt: UFix64,
    useExplicitClosedAt: Bool
) {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        let badge = signer.storage.borrow<&CoreMarketHub.RoleBadge>(
            from: CoreMarketHub.roleStoragePath(role: CoreMarketHub.Role.operator)
        ) ?? panic("operator role badge is required")

        let timestamp: UFix64? = useExplicitClosedAt ? closedAt : nil
        let cleanReason: String? = reason.length > 0 ? reason : nil

        CoreMarketHub.closeMarket(
            operatorBadge: badge,
            id: marketId,
            reason: cleanReason,
            closedAt: timestamp
        )
    }
}
