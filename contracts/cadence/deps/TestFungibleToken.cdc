access(all) contract interface FungibleToken {

    access(all) entitlement Withdraw

    access(all) resource interface Balance {
        access(all) var balance: UFix64
    }

    access(all) resource interface Provider {
        access(all) view fun isAvailableToWithdraw(amount: UFix64): Bool
        access(Withdraw) fun withdraw(amount: UFix64): @{Vault}
    }

    access(all) resource interface Receiver {
        access(all) fun deposit(from: @{Vault})
        access(all) view fun getSupportedVaultTypes(): {Type: Bool}
        access(all) view fun isSupportedVaultType(type: Type): Bool
    }

    access(all) resource interface Vault: Receiver, Provider, Balance {
        access(all) fun createEmptyVault(): @{Vault}
    }
}
