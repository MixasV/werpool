import FungibleToken from "FungibleToken"

access(all) contract FlowToken {

    access(all) let storagePath: StoragePath
    access(all) let receiverPath: PublicPath
    access(all) let balancePath: PublicPath

    access(all) var totalSupply: UFix64

    access(all) resource Vault: FungibleToken.Vault {
        access(all) var balance: UFix64

        init(balance: UFix64) {
            self.balance = balance
        }

        access(contract) fun burnCallback() {
            if self.balance > 0.0 {
                FlowToken.totalSupply = FlowToken.totalSupply - self.balance
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
            pre { amount <= self.balance: "insufficient balance" }
            self.balance = self.balance - amount
            return <-create Vault(balance: amount) as @{FungibleToken.Vault}
        }

        access(all) fun deposit(from: @{FungibleToken.Vault}) {
            let incoming <- from as! @Vault
            self.balance = self.balance + incoming.balance
            destroy incoming
        }

        access(all) fun createEmptyVault(): @{FungibleToken.Vault} {
            return <-create Vault(balance: 0.0) as @{FungibleToken.Vault}
        }

        access(all) view fun getViews(): [Type] {
            return []
        }

        access(all) fun resolveView(_ view: Type): AnyStruct? {
            return nil
        }
    }

    access(all) fun createEmptyVault(): @{FungibleToken.Vault} {
        return <-create Vault(balance: 0.0) as @{FungibleToken.Vault}
    }

    access(all) fun setupAccount(_ account: auth(Storage, Capabilities) &Account) {
        if account.storage.borrow<&Vault>(from: self.storagePath) == nil {
            account.storage.save(<-create Vault(balance: 0.0), to: self.storagePath)
        }

        account.capabilities.unpublish(self.receiverPath)
        account.capabilities.unpublish(self.balancePath)

        let receiver = account.capabilities.storage.issue<&{FungibleToken.Receiver}>(self.storagePath)
        account.capabilities.publish(receiver, at: self.receiverPath)

        let balance = account.capabilities.storage.issue<&{FungibleToken.Balance}>(self.storagePath)
        account.capabilities.publish(balance, at: self.balancePath)
    }

    access(all) fun mintTo(account: auth(Storage, Capabilities) &Account, amount: UFix64) {
        pre { amount > 0.0: "amount must be positive" }
        self.setupAccount(account)
        let vaultRef = account.storage.borrow<&Vault>(from: self.storagePath)!
        vaultRef.deposit(from: <-create Vault(balance: amount))
        self.totalSupply = self.totalSupply + amount
    }

    init() {
        self.storagePath = StoragePath(identifier: "testFlowTokenVault")!
        self.receiverPath = PublicPath(identifier: "testFlowTokenReceiver")!
        self.balancePath = PublicPath(identifier: "testFlowTokenBalance")!
        self.totalSupply = 0.0
        FlowToken.setupAccount(self.account)
    }
}
