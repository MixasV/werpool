import CoreMarketHub from "CoreMarketHub"

access(all) fun main(address: Address): Bool {
    return CoreMarketHub.hasRoleStorage(address: address)
}
