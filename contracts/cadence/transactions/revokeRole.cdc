import CoreMarketHub from "CoreMarketHub"

transaction(role: String, target: Address) {
    prepare(admin: auth(Storage, Capabilities) &Account) {
        let adminBadge = admin.storage.borrow<&CoreMarketHub.RoleBadge>(
            from: CoreMarketHub.roleStoragePath(role: CoreMarketHub.Role.admin)
        ) ?? panic("admin role badge is required")

        let roleType = CoreMarketHub.roleFromString(role)
        CoreMarketHub.revokeRoleFromAddress(
            adminBadge: adminBadge,
            role: roleType,
            target: target
        )
    }
}
