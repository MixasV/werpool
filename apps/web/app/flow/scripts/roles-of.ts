export const ROLES_OF_SCRIPT = String.raw`
  import CoreMarketHub from 0xCoreMarketHub

  access(all) fun main(address: Address): [String] {
    return CoreMarketHub.rolesOf(address: address)
  }
`;
