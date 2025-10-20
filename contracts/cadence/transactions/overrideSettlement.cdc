import CoreMarketHub from "CoreMarketHub"

transaction(marketId: UInt64, outcomeId: UInt64, txHash: String, notes: String?, reason: String) {
    let operatorBadge: &CoreMarketHub.RoleBadge

    prepare(signer: auth(Storage, Capabilities) &Account) {
        let storagePath = CoreMarketHub.roleStoragePath(role: CoreMarketHub.Role.operator)
        self.operatorBadge = signer.storage.borrow<&CoreMarketHub.RoleBadge>(from: storagePath)
            ?? panic("operator role badge is required")
    }

    execute {
        CoreMarketHub.overrideSettlement(
            operatorBadge: self.operatorBadge,
            id: marketId,
            outcomeId: outcomeId,
            txHash: txHash,
            notes: notes,
            reason: reason
        )
    }
}
