import CoreMarketHub from "CoreMarketHub"

access(all) fun main(address: Address): [String] {
    return CoreMarketHub.rolesOf(address: address)
}
