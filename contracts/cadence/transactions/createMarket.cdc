import CoreMarketHub from "CoreMarketHub"

transaction(
    slug: String,
    title: String,
    description: String,
    category: String,
    oracleId: String,
    useOracleId: Bool,
    closeAt: UFix64,
    useCloseAt: Bool,
    scheduledStartAt: UFix64,
    useScheduledStart: Bool,
    tradingLockAt: UFix64,
    useTradingLock: Bool,
    freezeWindowStartAt: UFix64,
    useFreezeStart: Bool,
    freezeWindowEndAt: UFix64,
    useFreezeEnd: Bool,
    patrolThreshold: UFix64,
    usePatrolThreshold: Bool,
    tags: [String],
    outcomeLabels: [String]
) {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        let storagePath = CoreMarketHub.roleStoragePath(role: CoreMarketHub.Role.operator)
        let badge = signer.storage.borrow<&CoreMarketHub.RoleBadge>(from: storagePath)
            ?? panic("operator role badge is required")

        let oracleOpt: String? = useOracleId ? oracleId : nil
        let closeOpt: UFix64? = useCloseAt ? closeAt : nil
        let startOpt: UFix64? = useScheduledStart ? scheduledStartAt : nil
        let lockOpt: UFix64? = useTradingLock ? tradingLockAt : nil
        let freezeStartOpt: UFix64? = useFreezeStart ? freezeWindowStartAt : nil
        let freezeEndOpt: UFix64? = useFreezeEnd ? freezeWindowEndAt : nil
        let patrolOpt: UFix64? = usePatrolThreshold ? patrolThreshold : nil

        let marketId = CoreMarketHub.createMarket(
            operatorBadge: badge,
            slug: slug,
            title: title,
            description: description,
            categoryRaw: category,
            oracleId: oracleOpt,
            closeAt: closeOpt,
            scheduledStartAt: startOpt,
            tradingLockAt: lockOpt,
            freezeWindowStartAt: freezeStartOpt,
            freezeWindowEndAt: freezeEndOpt,
            patrolThreshold: patrolOpt,
            tags: tags,
            outcomeLabels: outcomeLabels
        )
        CoreMarketHub.activateMarket(operatorBadge: badge, id: marketId)
    }
}
