import CoreMarketHub from "CoreMarketHub"

transaction(
    marketId: UInt64,
    scheduledStartAt: UFix64,
    useScheduledStart: Bool,
    tradingLockAt: UFix64,
    useTradingLock: Bool,
    freezeWindowStartAt: UFix64,
    useFreezeStart: Bool,
    freezeWindowEndAt: UFix64,
    useFreezeEnd: Bool
) {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        let badge = signer.storage.borrow<&CoreMarketHub.RoleBadge>(
            from: CoreMarketHub.roleStoragePath(role: CoreMarketHub.Role.operator)
        ) ?? panic("operator role badge is required")

        let startOpt: UFix64? = useScheduledStart ? scheduledStartAt : nil
        let lockOpt: UFix64? = useTradingLock ? tradingLockAt : nil
        let freezeStartOpt: UFix64? = useFreezeStart ? freezeWindowStartAt : nil
        let freezeEndOpt: UFix64? = useFreezeEnd ? freezeWindowEndAt : nil

        CoreMarketHub.updateMarketSchedule(
            operatorBadge: badge,
            id: marketId,
            scheduledStartAt: startOpt,
            tradingLockAt: lockOpt,
            freezeWindowStartAt: freezeStartOpt,
            freezeWindowEndAt: freezeEndOpt
        )
    }
}
