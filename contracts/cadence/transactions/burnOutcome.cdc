import OutcomeToken from "OutcomeToken"
import CoreMarketHub from "CoreMarketHub"
import FungibleToken from "FungibleToken"

transaction(marketId: UInt64, amount: UFix64) {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        let operatorPath = CoreMarketHub.roleStoragePath(role: CoreMarketHub.Role.operator)
        let hasOperator = signer.storage.borrow<&CoreMarketHub.RoleBadge>(from: operatorPath) != nil
        if !hasOperator {
            let adminPath = CoreMarketHub.roleStoragePath(role: CoreMarketHub.Role.admin)
            if signer.storage.borrow<&CoreMarketHub.RoleBadge>(from: adminPath) == nil {
                panic("operator or admin role badge is required")
            }
        }

        let storagePath = StoragePath(identifier: "forte_outcomeVault_".concat(marketId.toString()))!
        let providerRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &OutcomeToken.Vault>(from: storagePath)
            ?? panic("link outcome vault first")

        let vault <- providerRef.withdraw(amount: amount)
        OutcomeToken.burn(vault: <-vault)
    }
}
