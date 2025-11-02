import FungibleToken from 0x9a0766d93b6608b7
import ViewResolver from 0x3ea7ac2bcdd8bcef
import Burner from 0x3ea7ac2bcdd8bcef

// OutcomeTokenV4: Polymarket model with split/merge collateral
// 1 collateral = 1 complete set (all outcomes)
// Settlement: 1 winning share = 1 collateral
access(all) contract OutcomeTokenV4 {

    access(all) entitlement Admin

    access(all) let storageRoot: String

    // Events
    access(all) event VaultCreated(
        marketId: UInt64,
        outcomeIndex: Int,
        storagePath: StoragePath,
        receiverPath: PublicPath,
        balancePath: PublicPath,
        providerPath: PublicPath
    )

    access(all) event CompleteSetMinted(marketId: UInt64, amount: UFix64, minter: Address)
    access(all) event CompleteSetBurned(marketId: UInt64, amount: UFix64, burner: Address)
    access(all) event WinningSharesRedeemed(marketId: UInt64, outcomeIndex: Int, amount: UFix64, redeemer: Address)
    access(all) event AdminAdded(address: Address)
    access(all) event AdminRevoked(address: Address)

    // Track total supply per market AND outcome
    access(self) var totalSupplyByOutcome: {String: UFix64}
    access(self) var admins: {Address: Bool}
    access(self) var marketOutcomeCount: {UInt64: Int}

    // Helper to create composite key
    access(self) fun makeKey(marketId: UInt64, outcomeIndex: Int): String {
        return marketId.toString().concat("_").concat(outcomeIndex.toString())
    }

    // Vault for individual outcome tokens
    access(all) resource Vault: FungibleToken.Vault {
        access(all) var balance: UFix64
        access(all) let marketId: UInt64
        access(all) let outcomeIndex: Int

        init(marketId: UInt64, outcomeIndex: Int, balance: UFix64) {
            self.marketId = marketId
            self.outcomeIndex = outcomeIndex
            self.balance = balance
        }

        access(contract) fun burnCallback() {
            if self.balance > 0.0 {
                OutcomeTokenV4.decreaseSupply(self.marketId, self.outcomeIndex, self.balance)
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
            let vault <- create Vault(marketId: self.marketId, outcomeIndex: self.outcomeIndex, balance: amount)
            return <-vault as @{FungibleToken.Vault}
        }

        access(all) fun deposit(from: @{FungibleToken.Vault}) {
            let incoming <- from as! @OutcomeTokenV4.Vault
            if incoming.marketId != self.marketId {
                panic("market mismatch")
            }
            if incoming.outcomeIndex != self.outcomeIndex {
                panic("outcome mismatch")
            }
            self.balance = self.balance + incoming.balance
            destroy incoming
        }

        access(all) fun createEmptyVault(): @{FungibleToken.Vault} {
            return <-create Vault(marketId: self.marketId, outcomeIndex: self.outcomeIndex, balance: 0.0) as @{FungibleToken.Vault}
        }

        access(all) view fun getViews(): [Type] {
            return []
        }

        access(all) fun resolveView(_ view: Type): AnyStruct? {
            return nil
        }
    }

    access(self) fun increaseSupply(_ marketId: UInt64, _ outcomeIndex: Int, amount: UFix64) {
        let key = self.makeKey(marketId: marketId, outcomeIndex: outcomeIndex)
        let current = self.totalSupplyByOutcome[key] ?? 0.0
        self.totalSupplyByOutcome[key] = current + amount
    }

    access(self) fun decreaseSupply(_ marketId: UInt64, _ outcomeIndex: Int, _ amount: UFix64) {
        let key = self.makeKey(marketId: marketId, outcomeIndex: outcomeIndex)
        let current = self.totalSupplyByOutcome[key] ?? 0.0
        if amount > current {
            panic("supply underflow")
        }
        let updated = current - amount
        if updated == 0.0 {
            self.totalSupplyByOutcome.remove(key: key)
        } else {
            self.totalSupplyByOutcome[key] = updated
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

    // Register market with outcome count
    access(all) fun registerMarket(executor: Address, marketId: UInt64, outcomeCount: Int) {
        pre {
            outcomeCount > 1: "market must have at least 2 outcomes"
        }
        self.assertAdmin(executor)
        self.marketOutcomeCount[marketId] = outcomeCount
    }

    access(all) fun createVault(marketId: UInt64, outcomeIndex: Int): @OutcomeTokenV4.Vault {
        return <-create OutcomeTokenV4.Vault(marketId: marketId, outcomeIndex: outcomeIndex, balance: 0.0)
    }

    // POLYMARKET CORE: Split position (mint complete set)
    // User deposits collateral → receives equal shares of ALL outcomes
    access(all) fun splitPosition(marketId: UInt64, amount: UFix64): @{Int: {FungibleToken.Vault}} {
        pre {
            amount > 0.0: "amount must be positive"
            self.marketOutcomeCount[marketId] != nil: "market not registered"
        }
        
        let outcomeCount = self.marketOutcomeCount[marketId]!
        let vaults: @{Int: {FungibleToken.Vault}} <- {}
        
        var i = 0
        while i < outcomeCount {
            self.increaseSupply(marketId, i, amount: amount)
            let vault <- create Vault(marketId: marketId, outcomeIndex: i, balance: amount)
            vaults[i] <-! vault as @{FungibleToken.Vault}
            i = i + 1
        }
        
        return <-vaults
    }

    // POLYMARKET CORE: Merge position (burn complete set)
    // User burns equal shares of ALL outcomes → receives collateral back
    access(all) fun mergePosition(marketId: UInt64, vaults: @{Int: {FungibleToken.Vault}}): UFix64 {
        pre {
            self.marketOutcomeCount[marketId] != nil: "market not registered"
        }
        
        let outcomeCount = self.marketOutcomeCount[marketId]!
        
        // Validate: must have exactly one vault per outcome
        if vaults.length != outcomeCount {
            panic("must provide exactly one vault per outcome")
        }
        
        // Find minimum balance across all vaults
        var minBalance: UFix64? = nil
        var i = 0
        while i < outcomeCount {
            let vault <- vaults.remove(key: i)!
            let typedVault <- vault as! @OutcomeTokenV4.Vault
            
            if typedVault.marketId != marketId {
                panic("vault market mismatch")
            }
            if typedVault.outcomeIndex != i {
                panic("vault outcome index mismatch")
            }
            
            if minBalance == nil || typedVault.balance < minBalance! {
                minBalance = typedVault.balance
            }
            
            // Burn the vault
            self.decreaseSupply(marketId, i, typedVault.balance)
            destroy typedVault
            i = i + 1
        }
        
        destroy vaults
        
        return minBalance ?? 0.0
    }

    // POLYMARKET CORE: Redeem winning shares
    // After settlement, burn winning shares → receive 1:1 collateral
    access(all) fun redeemWinningShares(
        marketId: UInt64,
        winningOutcomeIndex: Int,
        vault: @{FungibleToken.Vault}
    ): UFix64 {
        let typedVault <- vault as! @OutcomeTokenV4.Vault
        
        assert(typedVault.marketId == marketId, message: "market mismatch")
        assert(typedVault.outcomeIndex == winningOutcomeIndex, message: "outcome mismatch")
        
        let amount = typedVault.balance
        self.decreaseSupply(marketId, winningOutcomeIndex, amount)
        destroy typedVault
        
        return amount
    }

    // Setup vault in user's account storage
    access(all) fun linkVault(account: auth(Storage, Capabilities) &Account, marketId: UInt64, outcomeIndex: Int) {
        let suffix = marketId.toString().concat("_").concat(outcomeIndex.toString())
        let storagePath = StoragePath(identifier: self.storageRoot.concat(suffix))!
        let receiverPath = PublicPath(identifier: "forte_outcomeReceiver_".concat(suffix))!
        let balancePath = PublicPath(identifier: "forte_outcomeBalance_".concat(suffix))!
        let providerPath = PublicPath(identifier: "forte_outcomeProvider_".concat(suffix))!

        if account.storage.borrow<&OutcomeTokenV4.Vault>(from: storagePath) == nil {
            account.storage.save(<-self.createVault(marketId: marketId, outcomeIndex: outcomeIndex), to: storagePath)
        }

        account.capabilities.unpublish(receiverPath)
        account.capabilities.unpublish(balancePath)
        account.capabilities.unpublish(providerPath)

        let fullCapability = account.capabilities.storage.issue<&OutcomeTokenV4.Vault>(storagePath)
        account.capabilities.publish(fullCapability, at: balancePath)

        let receiverCapability = account.capabilities.storage.issue<&{FungibleToken.Receiver}>(storagePath)
        account.capabilities.publish(receiverCapability, at: receiverPath)

        let providerCapability = account.capabilities.storage.issue<&{FungibleToken.Provider}>(storagePath)
        account.capabilities.publish(providerCapability, at: providerPath)

        emit VaultCreated(
            marketId: marketId,
            outcomeIndex: outcomeIndex,
            storagePath: storagePath,
            receiverPath: receiverPath,
            balancePath: balancePath,
            providerPath: providerPath
        )
    }

    access(all) fun getTotalSupply(marketId: UInt64, outcomeIndex: Int): UFix64 {
        let key = self.makeKey(marketId: marketId, outcomeIndex: outcomeIndex)
        return self.totalSupplyByOutcome[key] ?? 0.0
    }

    access(all) fun getOutcomeCount(marketId: UInt64): Int? {
        return self.marketOutcomeCount[marketId]
    }

    init() {
        self.storageRoot = "forte_outcomeTokenV4_"
        self.totalSupplyByOutcome = {}
        self.admins = {}
        self.marketOutcomeCount = {}
        
        // Contract deployer is initial admin
        let deployerAddress = self.account.address
        self.admins[deployerAddress] = true
        emit AdminAdded(address: deployerAddress)
    }
}
