export const SETUP_ROLE_STORAGE_TRANSACTION = String.raw`
  import CoreMarketHub from 0xCoreMarketHub

  transaction {
    prepare(account: auth(Storage, Capabilities) &Account) {
      CoreMarketHub.setupRoleStorage(account: account)
    }
  }
`;
