import CoreMarketHub from "CoreMarketHub"

transaction(marketId: UInt64, outcomeId: UInt64, txHash: String, notes: String?) {
    let oracleBadge: &CoreMarketHub.RoleBadge

    prepare(signer: auth(Storage, Capabilities) &Account) {
        let storagePath = CoreMarketHub.roleStoragePath(role: CoreMarketHub.Role.oracle)
        self.oracleBadge = signer.storage.borrow<&CoreMarketHub.RoleBadge>(from: storagePath)
            ?? panic("oracle role badge is required")
    }

    execute {
        CoreMarketHub.settleMarket(
            oracleBadge: self.oracleBadge,
            id: marketId,
            outcomeId: outcomeId,
            txHash: txHash,
            notes: notes
        )
    }
}
