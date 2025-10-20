import CoreMarketHub from "CoreMarketHub"

transaction(role: String, target: Address) {
    prepare(
        admin: auth(Storage, Capabilities) &Account,
        recipient: auth(Storage, Capabilities) &Account
    ) {
        if recipient.address != target {
            panic("recipient mismatch")
        }

        CoreMarketHub.setupRoleStorage(account: recipient)

        let adminBadge = admin.storage.borrow<&CoreMarketHub.RoleBadge>(
            from: CoreMarketHub.roleStoragePath(role: CoreMarketHub.Role.admin)
        ) ?? panic("admin role badge is required")

        let roleType = CoreMarketHub.roleFromString(role)
        let badge <- CoreMarketHub.grantRole(
            adminBadge: adminBadge,
            role: roleType,
            target: target
        )

        CoreMarketHub.storeRoleBadge(target: recipient, badge: <-badge)
    }
}
