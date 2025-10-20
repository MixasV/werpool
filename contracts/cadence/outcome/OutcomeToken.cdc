import FungibleToken from "FungibleToken"
import ViewResolver from "ViewResolver"
import Burner from "Burner"

access(all) contract OutcomeToken {

    access(all) entitlement Admin

    access(all) let storageRoot: String

    access(all) event VaultCreated(
        marketId: UInt64,
        storagePath: StoragePath,
        receiverPath: PublicPath,
        balancePath: PublicPath,
        providerPath: PublicPath
    )

    access(all) event AdminAdded(address: Address)
    access(all) event AdminRevoked(address: Address)

    access(self) var totalSupplyByMarket: {UInt64: UFix64}
    access(self) var admins: {Address: Bool}

    access(all) resource Vault: FungibleToken.Vault {
        access(all) var balance: UFix64
        access(all) let marketId: UInt64

        init(marketId: UInt64, balance: UFix64) {
            self.marketId = marketId
            self.balance = balance
        }

        access(contract) fun burnCallback() {
            if self.balance > 0.0 {
                OutcomeToken.decreaseSupply(self.marketId, self.balance)
                self.balance = 0.0
            }
        }

        access(all) view fun getSupportedVaultTypes(): {Type: Bool} {
            return {self.getType(): true}
        }

        access(all) view fun isSupportedVaultType(type: Type): Bool {
            return type == self.getType()
        }

        access(all) view fun isAvailableToWithdraw(amount: UFix64): Bool {
            return amount <= self.balance
        }

        access(FungibleToken.Withdraw) fun withdraw(amount: UFix64): @{FungibleToken.Vault} {
            pre {
                amount > 0.0: "withdraw amount must be positive"
                amount <= self.balance: "insufficient balance"
            }
            self.balance = self.balance - amount
            let vault <- create Vault(marketId: self.marketId, balance: amount)
            return <-vault as @{FungibleToken.Vault}
        }

        access(all) fun deposit(from: @{FungibleToken.Vault}) {
            let incoming <- from as! @OutcomeToken.Vault
            if incoming.marketId != self.marketId {
                panic("market mismatch")
            }
            self.balance = self.balance + incoming.balance
            destroy incoming
        }

        access(all) fun createEmptyVault(): @{FungibleToken.Vault} {
            return <-create Vault(marketId: self.marketId, balance: 0.0) as @{FungibleToken.Vault}
        }

        access(all) view fun getViews(): [Type] {
            return []
        }

        access(all) fun resolveView(_ view: Type): AnyStruct? {
            return nil
        }
    }

    access(self) fun increaseSupply(_ marketId: UInt64, amount: UFix64) {
        let current = self.totalSupplyByMarket[marketId] ?? 0.0
        self.totalSupplyByMarket[marketId] = current + amount
    }

    access(self) fun decreaseSupply(_ marketId: UInt64, _ amount: UFix64) {
        let current = self.totalSupplyByMarket[marketId] ?? 0.0
        if amount > current {
            panic("supply underflow")
        }
        let updated = current - amount
        if updated == 0.0 {
            self.totalSupplyByMarket.remove(key: marketId)
        } else {
            self.totalSupplyByMarket[marketId] = updated
        }
    }

    access(self) fun assertAdmin(_ address: Address) {
        if self.admins[address] != true {
            panic("admin role required")
        }
    }

    access(all) fun addAdmin(executor: Address, account: Address) {
        self.assertAdmin(executor)
        self.admins[account] = true
        emit AdminAdded(address: account)
    }

    access(all) fun revokeAdmin(executor: Address, account: Address) {
        self.assertAdmin(executor)
        if self.admins.remove(key: account) != nil {
            emit AdminRevoked(address: account)
        }
    }

    access(all) fun createVault(marketId: UInt64): @OutcomeToken.Vault {
        return <-create OutcomeToken.Vault(marketId: marketId, balance: 0.0)
    }

    access(all) fun mint(marketId: UInt64, amount: UFix64, executor: Address): @{FungibleToken.Vault} {
        self.assertAdmin(executor)
        if amount <= 0.0 {
            panic("amount must be positive")
        }
        self.increaseSupply(marketId, amount: amount)
        let vault <- create Vault(marketId: marketId, balance: amount)
        return <-vault as @{FungibleToken.Vault}
    }

    access(all) fun burn(vault: @{FungibleToken.Vault}) {
        let owned <- vault as! @OutcomeToken.Vault
        self.decreaseSupply(owned.marketId, owned.balance)
        destroy owned
    }

    access(all) fun linkVault(account: auth(Storage, Capabilities) &Account, marketId: UInt64) {
        let suffix = marketId.toString()
        let storagePath = StoragePath(identifier: self.storageRoot.concat(suffix))!
        let receiverPath = PublicPath(identifier: "/public/forte_outcomeReceiver_".concat(suffix))!
        let balancePath = PublicPath(identifier: "/public/forte_outcomeBalance_".concat(suffix))!
        let providerPath = PublicPath(identifier: "/public/forte_outcomeProvider_".concat(suffix))!

        if account.storage.borrow<&OutcomeToken.Vault>(from: storagePath) == nil {
            account.storage.save(<-self.createVault(marketId: marketId), to: storagePath)
        }

        account.capabilities.unpublish(receiverPath)
        account.capabilities.unpublish(balancePath)
        account.capabilities.unpublish(providerPath)

        let fullCapability = account.capabilities.storage.issue<&OutcomeToken.Vault>(storagePath)
        account.capabilities.publish(fullCapability, at: balancePath)

        let receiverCapability = account.capabilities.storage.issue<&{FungibleToken.Receiver}>(storagePath)
        account.capabilities.publish(receiverCapability, at: receiverPath)

        let providerCapability = account.capabilities.storage.issue<&{FungibleToken.Provider}>(storagePath)
        account.capabilities.publish(providerCapability, at: providerPath)

        emit VaultCreated(
            marketId: marketId,
            storagePath: storagePath,
            receiverPath: receiverPath,
            balancePath: balancePath,
            providerPath: providerPath
        )
    }

    access(all) fun getTotalSupply(marketId: UInt64): UFix64 {
        return self.totalSupplyByMarket[marketId] ?? 0.0
    }

    init() {
        let admin = self.account.address
        self.storageRoot = "forte_outcomeVault_"
        let emptySupply: {UInt64: UFix64} = {}
        self.totalSupplyByMarket = emptySupply

        let emptyAdmins: {Address: Bool} = {}
        self.admins = emptyAdmins
        self.admins[admin] = true
        emit AdminAdded(address: admin)
    }
}
