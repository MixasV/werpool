export const CAN_RECEIVE_ROLES_SCRIPT = String.raw`
  import CoreMarketHub from 0xCoreMarketHub

  pub fun main(address: Address): Bool {
    return CoreMarketHub.hasRoleStorage(address: address)
  }
`;
