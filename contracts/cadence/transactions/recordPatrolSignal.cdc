import CoreMarketHub from "CoreMarketHub"

transaction(
    marketId: UInt64,
    severity: String,
    code: String,
    weight: UFix64,
    expiresAt: UFix64,
    useExpiresAt: Bool,
    notes: String
) {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        let badge = signer.storage.borrow<&CoreMarketHub.RoleBadge>(
            from: CoreMarketHub.roleStoragePath(role: CoreMarketHub.Role.patrol)
        ) ?? panic("patrol role badge is required")

        let expiresOpt: UFix64? = useExpiresAt ? expiresAt : nil
        let notesOpt: String? = notes.length > 0 ? notes : nil

        CoreMarketHub.recordPatrolSignal(
            patrolBadge: badge,
            id: marketId,
            severityRaw: severity,
            code: code,
            weight: weight,
            expiresAt: expiresOpt,
            notes: notesOpt
        )
    }
}
