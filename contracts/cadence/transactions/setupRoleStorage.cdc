import CoreMarketHub from "CoreMarketHub"

transaction {
    prepare(account: auth(Storage, Capabilities) &Account) {
        CoreMarketHub.setupRoleStorage(account: account)
    }
}
