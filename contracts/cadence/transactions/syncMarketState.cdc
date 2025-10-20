import CoreMarketHub from "CoreMarketHub"
import LMSRAmm from "LMSRAmm"

transaction(
    marketId: UInt64,
    bVector: [UFix64],
    totalLiquidity: UFix64,
    outcomeSupply: [UFix64]
) {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        let operatorPath = CoreMarketHub.roleStoragePath(role: CoreMarketHub.Role.operator)
        if signer.storage.borrow<&CoreMarketHub.RoleBadge>(from: operatorPath) == nil {
            let adminPath = CoreMarketHub.roleStoragePath(role: CoreMarketHub.Role.admin)
            if signer.storage.borrow<&CoreMarketHub.RoleBadge>(from: adminPath) == nil {
                panic("operator or admin role badge is required")
            }
        }
        LMSRAmm.syncState(marketId: marketId, bVector: bVector, totalLiquidity: totalLiquidity, outcomeSupply: outcomeSupply)
    }
}
