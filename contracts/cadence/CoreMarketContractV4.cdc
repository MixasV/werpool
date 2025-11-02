import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import OutcomeTokenV4 from 0x3ea7ac2bcdd8bcef

// CoreMarketContractV4: Polymarket-style prediction market
// - Split/merge collateral (1:1 backing)
// - 1:1 settlement for winning shares
// - No LMSR, uses order book for trading
access(all) contract CoreMarketContractV4 {

    // --- Storage paths ---
    access(all) let CollateralVaultStoragePath: StoragePath
    access(all) let AdminStoragePath: StoragePath

    // --- Events ---
    access(all) event MarketCreated(
        marketId: UInt64,
        question: String,
        outcomes: [String],
        creator: Address,
        closeAt: UFix64
    )

    access(all) event PositionSplit(
        marketId: UInt64,
        user: Address,
        collateralAmount: UFix64,
        timestamp: UFix64
    )

    access(all) event PositionMerged(
        marketId: UInt64,
        user: Address,
        sharesAmount: UFix64,
        collateralReturned: UFix64,
        timestamp: UFix64
    )

    access(all) event MarketSettled(
        marketId: UInt64,
        winningOutcome: Int,
        settledAt: UFix64,
        settledBy: Address
    )

    access(all) event WinningSharesRedeemed(
        marketId: UInt64,
        user: Address,
        shares: UFix64,
        collateralReturned: UFix64,
        timestamp: UFix64
    )

    access(all) event MarketScheduledForAutoSettlement(
        marketId: UInt64,
        scheduledTime: UFix64,
        scheduledTxId: UInt64
    )

    // --- Enums ---
    access(all) enum MarketState: UInt8 {
        access(all) case active
        access(all) case closed
        access(all) case settled
        access(all) case voided
    }

    access(all) enum Role: UInt8 {
        access(all) case admin
        access(all) case operator
        access(all) case oracle
        access(all) case patrol
    }

    // --- Structs ---
    access(all) struct PatrolSignal {
        access(all) let reporter: Address
        access(all) let code: String
        access(all) let weight: UFix64
        access(all) let timestamp: UFix64
        access(all) let expiresAt: UFix64

        init(reporter: Address, code: String, weight: UFix64, timestamp: UFix64, expiresAt: UFix64) {
            self.reporter = reporter
            self.code = code
            self.weight = weight
            self.timestamp = timestamp
            self.expiresAt = expiresAt
        }

        access(all) fun isExpired(at: UFix64): Bool {
            return at >= self.expiresAt
        }
    }

    access(all) struct Market {
        access(all) let id: UInt64
        access(all) let question: String
        access(all) let outcomes: [String]
        access(all) let creator: Address
        access(all) let createdAt: UFix64
        access(all) let closeAt: UFix64
        access(all) var state: MarketState
        access(all) var winningOutcome: Int?
        access(all) var settledAt: UFix64?
        access(all) var settledBy: Address?
        access(all) var totalCollateralLocked: UFix64
        access(all) var patrolSignals: {Address: PatrolSignal}
        access(all) var patrolThreshold: UFix64
        access(all) var freezeWindowStart: UFix64?
        access(all) var freezeWindowEnd: UFix64?
        access(all) var autoSettlementTxId: UInt64?

        init(
            id: UInt64,
            question: String,
            outcomes: [String],
            creator: Address,
            closeAt: UFix64,
            patrolThreshold: UFix64,
            state: MarketState?,
            winningOutcome: Int?,
            settledAt: UFix64?,
            settledBy: Address?,
            totalCollateralLocked: UFix64?,
            patrolSignals: {Address: PatrolSignal}?,
            freezeWindowStart: UFix64?,
            freezeWindowEnd: UFix64?,
            autoSettlementTxId: UInt64?
        ) {
            self.id = id
            self.question = question
            self.outcomes = outcomes
            self.creator = creator
            self.createdAt = getCurrentBlock().timestamp
            self.closeAt = closeAt
            self.state = state ?? MarketState.active
            self.winningOutcome = winningOutcome
            self.settledAt = settledAt
            self.settledBy = settledBy
            self.totalCollateralLocked = totalCollateralLocked ?? 0.0
            self.patrolSignals = patrolSignals ?? {}
            self.patrolThreshold = patrolThreshold
            self.freezeWindowStart = freezeWindowStart
            self.freezeWindowEnd = freezeWindowEnd
            self.autoSettlementTxId = autoSettlementTxId
        }
    }

    // --- Storage ---
    access(all) var markets: {UInt64: Market}
    access(all) var nextMarketId: UInt64
    access(all) var collateralVaults: @{UInt64: {FungibleToken.Vault}}
    access(all) var roles: {Address: {Role: Bool}}

    // --- Role Management ---
    access(self) view fun hasRole(address: Address, role: Role): Bool {
        if let userRoles = self.roles[address] {
            return userRoles[role] ?? false
        }
        return false
    }

    // --- Helper: Update Market Collateral ---
    access(self) fun updateMarketCollateral(marketId: UInt64, totalCollateralLocked: UFix64) {
        let old = self.markets[marketId]!
        self.markets[marketId] = Market(
            id: old.id,
            question: old.question,
            outcomes: old.outcomes,
            creator: old.creator,
            closeAt: old.closeAt,
            patrolThreshold: old.patrolThreshold,
            state: old.state,
            winningOutcome: old.winningOutcome,
            settledAt: old.settledAt,
            settledBy: old.settledBy,
            totalCollateralLocked: totalCollateralLocked,
            patrolSignals: old.patrolSignals,
            freezeWindowStart: old.freezeWindowStart,
            freezeWindowEnd: old.freezeWindowEnd,
            autoSettlementTxId: old.autoSettlementTxId
        )
    }

    access(self) fun updateMarketSettlement(marketId: UInt64, state: MarketState, winningOutcome: Int, settledAt: UFix64, settledBy: Address) {
        let old = self.markets[marketId]!
        self.markets[marketId] = Market(
            id: old.id,
            question: old.question,
            outcomes: old.outcomes,
            creator: old.creator,
            closeAt: old.closeAt,
            patrolThreshold: old.patrolThreshold,
            state: state,
            winningOutcome: winningOutcome,
            settledAt: settledAt,
            settledBy: settledBy,
            totalCollateralLocked: old.totalCollateralLocked,
            patrolSignals: old.patrolSignals,
            freezeWindowStart: old.freezeWindowStart,
            freezeWindowEnd: old.freezeWindowEnd,
            autoSettlementTxId: old.autoSettlementTxId
        )
    }

    access(self) fun addPatrolSignal(marketId: UInt64, reporter: Address, signal: PatrolSignal) {
        let old = self.markets[marketId]!
        
        // Copy patrol signals and add new one
        let newPatrolSignals: {Address: PatrolSignal} = {}
        for addr in old.patrolSignals.keys {
            newPatrolSignals[addr] = old.patrolSignals[addr]!
        }
        newPatrolSignals[reporter] = signal
        
        self.markets[marketId] = Market(
            id: old.id,
            question: old.question,
            outcomes: old.outcomes,
            creator: old.creator,
            closeAt: old.closeAt,
            patrolThreshold: old.patrolThreshold,
            state: old.state,
            winningOutcome: old.winningOutcome,
            settledAt: old.settledAt,
            settledBy: old.settledBy,
            totalCollateralLocked: old.totalCollateralLocked,
            patrolSignals: newPatrolSignals,
            freezeWindowStart: old.freezeWindowStart,
            freezeWindowEnd: old.freezeWindowEnd,
            autoSettlementTxId: old.autoSettlementTxId
        )
    }

    access(all) fun grantRole(grantor: Address, account: Address, role: Role) {
        assert(self.hasRole(address: grantor, role: Role.admin), message: "only admin can grant roles")
        
        if self.roles[account] == nil {
            self.roles[account] = {}
        }
        self.roles[account]!.insert(key: role, true)
    }

    // --- Market Creation ---
    access(all) fun createMarket(
        creator: Address,
        question: String,
        outcomes: [String],
        closeAt: UFix64,
        patrolThreshold: UFix64
    ): UInt64 {
        pre {
            outcomes.length >= 2: "market must have at least 2 outcomes"
            closeAt > getCurrentBlock().timestamp: "close time must be in future"
        }

        let marketId = self.nextMarketId
        self.nextMarketId = self.nextMarketId + 1

        let market = Market(
            id: marketId,
            question: question,
            outcomes: outcomes,
            creator: creator,
            closeAt: closeAt,
            patrolThreshold: patrolThreshold,
            state: nil,
            winningOutcome: nil,
            settledAt: nil,
            settledBy: nil,
            totalCollateralLocked: nil,
            patrolSignals: nil,
            freezeWindowStart: nil,
            freezeWindowEnd: nil,
            autoSettlementTxId: nil
        )

        self.markets[marketId] = market
        
        // Create collateral vault for this market
        self.collateralVaults[marketId] <-! FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>())

        // Register market in OutcomeTokenV4
        OutcomeTokenV4.registerMarket(
            executor: self.account.address,
            marketId: marketId,
            outcomeCount: outcomes.length
        )

        emit MarketCreated(
            marketId: marketId,
            question: question,
            outcomes: outcomes,
            creator: creator,
            closeAt: closeAt
        )

        return marketId
    }

    // --- POLYMARKET CORE: Split Position ---
    access(all) fun splitPosition(
        marketId: UInt64,
        user: Address,
        collateral: @{FungibleToken.Vault}
    ): @{Int: {FungibleToken.Vault}} {
        pre {
            self.markets[marketId] != nil: "market not found"
            self.markets[marketId]!.state == MarketState.active: "market not active"
            collateral.balance > 0.0: "collateral must be positive"
        }

        let amount = collateral.balance
        
        // Lock collateral in market vault
        let vaultRef = &self.collateralVaults[marketId] as &{FungibleToken.Vault}?
        vaultRef!.deposit(from: <-collateral)
        
        // Update market stats
        let old = self.markets[marketId]!
        self.updateMarketCollateral(marketId: marketId, totalCollateralLocked: old.totalCollateralLocked + amount)

        // Mint complete set of outcome tokens
        let outcomeVaults <- OutcomeTokenV4.splitPosition(marketId: marketId, amount: amount)

        emit PositionSplit(
            marketId: marketId,
            user: user,
            collateralAmount: amount,
            timestamp: getCurrentBlock().timestamp
        )

        return <-outcomeVaults
    }

    // --- POLYMARKET CORE: Merge Position ---
    access(all) fun mergePosition(
        marketId: UInt64,
        user: Address,
        outcomeVaults: @{Int: {FungibleToken.Vault}}
    ): @{FungibleToken.Vault} {
        pre {
            self.markets[marketId] != nil: "market not found"
        }

        // Burn complete set of outcome tokens
        let collateralAmount = OutcomeTokenV4.mergePosition(marketId: marketId, vaults: <-outcomeVaults)

        // Withdraw collateral from market vault
        let vaultRef = &self.collateralVaults[marketId] as auth(FungibleToken.Withdraw) &{FungibleToken.Vault}?
        let collateral <- vaultRef!.withdraw(amount: collateralAmount)

        // Update market stats
        let old = self.markets[marketId]!
        self.updateMarketCollateral(marketId: marketId, totalCollateralLocked: old.totalCollateralLocked - collateralAmount)

        emit PositionMerged(
            marketId: marketId,
            user: user,
            sharesAmount: collateralAmount,
            collateralReturned: collateralAmount,
            timestamp: getCurrentBlock().timestamp
        )

        return <-collateral
    }

    // --- Patrol System ---
    access(all) fun recordPatrolSignal(
        reporter: Address,
        marketId: UInt64,
        code: String,
        weight: UFix64,
        expiresAt: UFix64
    ) {
        pre {
            self.markets[marketId] != nil: "market not found"
        }
        
        assert(self.hasRole(address: reporter, role: Role.patrol), message: "reporter must have patrol role")

        let signal = PatrolSignal(
            reporter: reporter,
            code: code,
            weight: weight,
            timestamp: getCurrentBlock().timestamp,
            expiresAt: expiresAt
        )

        self.addPatrolSignal(marketId: marketId, reporter: reporter, signal: signal)
    }

    access(all) fun clearPatrolSignal(marketId: UInt64, reporter: Address) {
        pre {
            self.markets[marketId] != nil: "market not found"
        }
        self.markets[marketId]!.patrolSignals.remove(key: reporter)
    }

    // --- Settlement ---
    access(all) fun settleMarket(
        settler: Address,
        marketId: UInt64,
        winningOutcome: Int
    ) {
        pre {
            self.markets[marketId] != nil: "market not found"
            self.markets[marketId]!.state == MarketState.active || self.markets[marketId]!.state == MarketState.closed: "market not settleable"
            winningOutcome >= 0 && winningOutcome < self.markets[marketId]!.outcomes.length: "invalid winning outcome"
        }
        
        assert(self.hasRole(address: settler, role: Role.oracle), message: "settler must have oracle role")

        let market = self.markets[marketId]!
        let now = getCurrentBlock().timestamp

        // CHECK 1: Market must be closed
        if now < market.closeAt {
            panic("market not yet closed")
        }

        // CHECK 2: Not in freeze window
        if market.freezeWindowStart != nil && market.freezeWindowEnd != nil {
            if now >= market.freezeWindowStart! && now <= market.freezeWindowEnd! {
                panic("market in freeze window, cannot settle")
            }
        }

        // CHECK 3: No active patrol signals above threshold
        var totalPatrolWeight: UFix64 = 0.0
        for signal in market.patrolSignals.values {
            if !signal.isExpired(at: now) {
                totalPatrolWeight = totalPatrolWeight + signal.weight
            }
        }

        if totalPatrolWeight >= market.patrolThreshold {
            panic("market disputed by patrol, cannot settle")
        }

        // All checks passed - settle market
        self.updateMarketSettlement(
            marketId: marketId,
            state: MarketState.settled,
            winningOutcome: winningOutcome,
            settledAt: now,
            settledBy: settler
        )

        emit MarketSettled(
            marketId: marketId,
            winningOutcome: winningOutcome,
            settledAt: now,
            settledBy: settler
        )
    }

    // --- POLYMARKET CORE: Redeem Winning Shares ---
    access(all) fun redeemWinningShares(
        marketId: UInt64,
        user: Address,
        winningVault: @{FungibleToken.Vault}
    ): @{FungibleToken.Vault} {
        pre {
            self.markets[marketId] != nil: "market not found"
            self.markets[marketId]!.state == MarketState.settled: "market not settled"
            self.markets[marketId]!.winningOutcome != nil: "no winning outcome"
        }

        let winningOutcome = self.markets[marketId]!.winningOutcome!
        
        // Redeem winning shares (1:1 for collateral)
        let collateralAmount = OutcomeTokenV4.redeemWinningShares(
            marketId: marketId,
            winningOutcomeIndex: winningOutcome,
            vault: <-winningVault
        )

        // Withdraw collateral from market vault
        let vaultRef = &self.collateralVaults[marketId] as auth(FungibleToken.Withdraw) &{FungibleToken.Vault}?
        let collateral <- vaultRef!.withdraw(amount: collateralAmount)

        emit WinningSharesRedeemed(
            marketId: marketId,
            user: user,
            shares: collateralAmount,
            collateralReturned: collateralAmount,
            timestamp: getCurrentBlock().timestamp
        )

        return <-collateral
    }

    // --- Market Getters ---
    access(all) fun getMarket(marketId: UInt64): Market? {
        return self.markets[marketId]
    }

    access(all) fun getMarketCollateralLocked(marketId: UInt64): UFix64? {
        if let market = self.markets[marketId] {
            return market.totalCollateralLocked
        }
        return nil
    }

    // --- Init ---
    init() {
        self.CollateralVaultStoragePath = /storage/CoreMarketV4CollateralVault
        self.AdminStoragePath = /storage/CoreMarketV4Admin

        self.markets = {}
        self.nextMarketId = 1
        self.collateralVaults <- {}
        self.roles = {}

        // Contract deployer is admin
        self.roles[self.account.address] = {Role.admin: true, Role.oracle: true}
    }
}
