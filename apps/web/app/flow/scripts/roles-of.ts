export const ROLES_OF_SCRIPT = String.raw`
  import CoreMarketHub from 0xCoreMarketHub

  pub fun main(address: Address): [String] {
    return CoreMarketHub.rolesOf(address: address)
  }
`;
