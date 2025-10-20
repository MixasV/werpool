import FungibleToken from "FungibleToken"

access(all) contract LMSRAmm {

    access(all) let marketPoolStorageRoot: String
    access(all) let outcomeVaultStorageRoot: String

    access(all) struct TradeQuote {
        access(all) let cost: UFix64
        access(all) let newProbabilities: [UFix64]
        access(all) let newBVector: [UFix64]
        access(all) let newTotalLiquidity: UFix64
        access(all) let newOutcomeSupply: [UFix64]

        init(
            cost: UFix64,
            newProbabilities: [UFix64],
            newBVector: [UFix64],
            newTotalLiquidity: UFix64,
            newOutcomeSupply: [UFix64]
        ) {
            self.cost = cost
            self.newProbabilities = newProbabilities
            self.newBVector = newBVector
            self.newTotalLiquidity = newTotalLiquidity
            self.newOutcomeSupply = newOutcomeSupply
        }
    }

    access(all) resource interface PoolReceiver {
        access(all) fun depositFlow(from: @{FungibleToken.Vault})
    }

    access(all) resource interface PoolProvider {
        access(all) fun withdrawFlow(amount: UFix64, to: &{FungibleToken.Receiver})
    }

    access(all) resource interface PoolStateReader {
        access(all) fun getStateSnapshot(): PoolState
    }

    access(all) resource MarketPool: PoolReceiver, PoolProvider, PoolStateReader {
        access(all) let marketId: UInt64
        access(all) var baseTokenVault: @{FungibleToken.Vault}
        access(all) var bVector: [UFix64]
        access(all) let liquidityParameter: UFix64
        access(all) var totalLiquidity: UFix64

        init(marketId: UInt64, outcomeCount: Int, liquidityParameter: UFix64, seedVault: @{FungibleToken.Vault}) {
            self.marketId = marketId
            let seedAmount = seedVault.balance
            self.baseTokenVault <- seedVault
            self.bVector = []
            var index = 0
            while index < outcomeCount {
                self.bVector.append(0.0)
                index = index + 1
            }
            self.liquidityParameter = liquidityParameter
            self.totalLiquidity = seedAmount
        }

        access(all) fun depositFlow(from vault: @{FungibleToken.Vault}) {
            let amount = vault.balance
            self.baseTokenVault.deposit(from: <-vault)
            self.totalLiquidity = self.totalLiquidity + amount
            if let current = LMSRAmm.pools[self.marketId] {
                LMSRAmm.pools[self.marketId] = PoolState(
                    marketId: self.marketId,
                    bVector: current.bVector,
                    liquidityParameter: current.liquidityParameter,
                    totalLiquidity: self.totalLiquidity,
                    outcomeSupply: current.outcomeSupply
                )
            }
        }

        access(all) fun withdrawFlow(amount: UFix64, to: &{FungibleToken.Receiver}) {
            let withdrawal <- self.baseTokenVault.withdraw(amount: amount)
            to.deposit(from: <-withdrawal)
            self.totalLiquidity = self.totalLiquidity - amount
            if let current = LMSRAmm.pools[self.marketId] {
                LMSRAmm.pools[self.marketId] = PoolState(
                    marketId: self.marketId,
                    bVector: current.bVector,
                    liquidityParameter: current.liquidityParameter,
                    totalLiquidity: self.totalLiquidity,
                    outcomeSupply: current.outcomeSupply
                )
            }
        }

        access(all) fun getStateSnapshot(): PoolState {
            return LMSRAmm.pools[self.marketId]!
        }

    }

    access(all) struct PoolState {
        access(all) let marketId: UInt64
        access(all) let bVector: [UFix64]
        access(all) let liquidityParameter: UFix64
        access(all) let totalLiquidity: UFix64
        access(all) let outcomeSupply: [UFix64]

        init(marketId: UInt64, bVector: [UFix64], liquidityParameter: UFix64, totalLiquidity: UFix64, outcomeSupply: [UFix64]) {
            self.marketId = marketId
            self.bVector = bVector
            self.liquidityParameter = liquidityParameter
            self.totalLiquidity = totalLiquidity
            self.outcomeSupply = outcomeSupply
        }
    }

    access(self) let tolerance: Fix64
    access(self) var pools: {UInt64: PoolState}

    access(self) fun toFix64(value: UFix64): Fix64 {
        return Fix64(value)
    }

    access(self) fun toUFix64(value: Fix64): UFix64 {
        if value <= 0.0 {
            return 0.0
        }
        return UFix64(value)
    }

    access(self) fun absFix(value: Fix64): Fix64 {
        if value < 0.0 {
            return -value
        }
        return value
    }

    access(self) fun isCloseToZero(value: Fix64): Bool {
        return self.absFix(value: value) <= self.tolerance
    }

    access(self) fun exp(value: Fix64): Fix64 {
        var term: Fix64 = 1.0
        var sum: Fix64 = 1.0
        var iteration = 1
        while iteration < 40 {
            term = term * value / Fix64(iteration)
            sum = sum + term
            if self.isCloseToZero(value: term) {
                break
            }
            iteration = iteration + 1
        }
        return sum
    }

    access(self) fun ln(value: Fix64): Fix64 {
        if value <= 0.0 {
            panic("ln domain error")
        }
        var estimate: Fix64 = value - 1.0
        var iteration = 0
        while iteration < 40 {
            let expEstimate = self.exp(value: estimate)
            let delta = (expEstimate - value) / expEstimate
            estimate = estimate - delta
            if self.isCloseToZero(value: delta) {
                break
            }
            iteration = iteration + 1
        }
        return estimate
    }

    access(self) fun logSumExp(bVector: [UFix64], liquidityParameter: UFix64): Fix64 {
        if bVector.length == 0 {
            return 0.0
        }
        let gamma = self.toFix64(value: liquidityParameter)
        var maxScaled: Fix64 = self.toFix64(value: bVector[0]) / gamma
        var index = 1
        let count = bVector.length
        while index < count {
            let scaled = self.toFix64(value: bVector[index]) / gamma
            if scaled > maxScaled {
                maxScaled = scaled
            }
            index = index + 1
        }
        var sumExp: Fix64 = 0.0
        index = 0
        while index < count {
            let scaled = self.toFix64(value: bVector[index]) / gamma
            let shifted = scaled - maxScaled
            sumExp = sumExp + self.exp(value: shifted)
            index = index + 1
        }
        return maxScaled + self.ln(value: sumExp)
    }

    access(self) fun costFix(bVector: [UFix64], liquidityParameter: UFix64): Fix64 {
        if liquidityParameter <= 0.0 {
            panic("liquidity parameter must be positive")
        }
        let gamma = self.toFix64(value: liquidityParameter)
        let lse = self.logSumExp(bVector: bVector, liquidityParameter: liquidityParameter)
        return gamma * lse
    }

    access(self) fun computeProbabilities(
        bVector: [UFix64],
        liquidityParameter: UFix64
    ): [UFix64] {
        let count = bVector.length
        if count == 0 {
            return [] as [UFix64]
        }
        let gamma = self.toFix64(value: liquidityParameter)
        var maxScaled: Fix64 = self.toFix64(value: bVector[0]) / gamma
        var index = 1
        while index < count {
            let scaled = self.toFix64(value: bVector[index]) / gamma
            if scaled > maxScaled {
                maxScaled = scaled
            }
            index = index + 1
        }
        var expTerms: [Fix64] = []
        var sumExp: Fix64 = 0.0
        index = 0
        while index < count {
            let scaled = self.toFix64(value: bVector[index]) / gamma
            let shifted = scaled - maxScaled
            let expValue = self.exp(value: shifted)
            expTerms.append(expValue)
            sumExp = sumExp + expValue
            index = index + 1
        }
        var probabilities: [UFix64] = []
        index = 0
        while index < count {
            let ratio = expTerms[index] / sumExp
            probabilities.append(self.clampProbability(value: ratio))
            index = index + 1
        }
        return probabilities
    }

    access(self) fun clampProbability(value: Fix64): UFix64 {
        var clamped = value
        if clamped < 0.0 {
            clamped = 0.0
        }
        if clamped > 1.0 {
            clamped = 1.0
        }
        return UFix64(clamped)
    }

    access(all) event PoolCreated(marketId: UInt64, storagePath: StoragePath, publicPath: PublicPath, timestamp: UFix64)

    access(all) fun createMarketPool(
        marketId: UInt64,
        outcomeCount: Int,
        liquidityParameter: UFix64,
        seedVault: @{FungibleToken.Vault}
    ): @MarketPool {
        if self.pools[marketId] != nil {
            panic("market pool already exists")
        }
        var zeroVector: [UFix64] = []
        var index = 0
        while index < outcomeCount {
            zeroVector.append(0.0)
            index = index + 1
        }
        var zeroSupply: [UFix64] = []
        var idx = 0
        while idx < outcomeCount {
            zeroSupply.append(0.0)
            idx = idx + 1
        }

        self.pools[marketId] = PoolState(
            marketId: marketId,
            bVector: zeroVector,
            liquidityParameter: liquidityParameter,
            totalLiquidity: seedVault.balance,
            outcomeSupply: zeroSupply
        )
        return <-create MarketPool(
            marketId: marketId,
            outcomeCount: outcomeCount,
            liquidityParameter: liquidityParameter,
            seedVault: <-seedVault
        )
    }

    access(all) fun quoteTrade(
        marketId: UInt64,
        outcomeIndex: Int,
        shares: UFix64,
        isBuy: Bool
    ): TradeQuote {
        let state = self.pools[marketId] ?? panic("unknown market")
        if outcomeIndex < 0 || outcomeIndex >= state.bVector.length {
            panic("invalid outcome index")
        }
        if shares <= 0.0 {
            panic("shares must be positive")
        }
        if state.liquidityParameter <= 0.0 {
            panic("liquidity parameter missing")
        }

        var updatedB: [UFix64] = []
        var idx = 0
        while idx < state.bVector.length {
            let current = state.bVector[idx]
            if idx == outcomeIndex {
                if isBuy {
                    updatedB.append(current + shares)
                } else {
                    if current < shares {
                        panic("insufficient outcome depth")
                    }
                    updatedB.append(current - shares)
                }
            } else {
                updatedB.append(current)
            }
            idx = idx + 1
        }

        var updatedSupply: [UFix64] = []
        idx = 0
        while idx < state.outcomeSupply.length {
            let supplyValue = state.outcomeSupply[idx]
            if idx == outcomeIndex {
                if isBuy {
                    updatedSupply.append(supplyValue + shares)
                } else {
                    if supplyValue < shares {
                        panic("insufficient outcome supply")
                    }
                    updatedSupply.append(supplyValue - shares)
                }
            } else {
                updatedSupply.append(supplyValue)
            }
            idx = idx + 1
        }

        let costBefore = self.costFix(bVector: state.bVector, liquidityParameter: state.liquidityParameter)
        let costAfter = self.costFix(bVector: updatedB, liquidityParameter: state.liquidityParameter)
        var delta = costAfter - costBefore
        if isBuy && delta < 0.0 {
            delta = -delta
        } else if !isBuy && delta > 0.0 {
            delta = -delta
        }

        let flowAmount = self.toUFix64(value: self.absFix(value: delta))
        if !isBuy && flowAmount > state.totalLiquidity {
            panic("insufficient liquidity to settle trade")
        }

        let newTotalLiquidity = isBuy
            ? state.totalLiquidity + flowAmount
            : state.totalLiquidity - flowAmount

        let probabilities = self.computeProbabilities(
            bVector: updatedB,
            liquidityParameter: state.liquidityParameter
        )

        return TradeQuote(
            cost: flowAmount,
            newProbabilities: probabilities,
            newBVector: updatedB,
            newTotalLiquidity: newTotalLiquidity,
            newOutcomeSupply: updatedSupply
        )
    }

    access(all) fun settlePayoutPerShare(marketId: UInt64, winningIndex: Int): UFix64 {
        let state = self.pools[marketId] ?? panic("unknown market")
        if winningIndex < 0 || winningIndex >= state.outcomeSupply.length {
            panic("invalid outcome index")
        }
        let totalShares = state.outcomeSupply[winningIndex]
        if totalShares == 0.0 {
            return 0.0
        }
        return state.totalLiquidity / totalShares
    }

    access(all) fun currentCost(marketId: UInt64): UFix64 {
        let state = self.pools[marketId] ?? panic("unknown market")
        return self.toUFix64(value: self.costFix(bVector: state.bVector, liquidityParameter: state.liquidityParameter))
    }

    access(all) fun syncState(marketId: UInt64, bVector: [UFix64], totalLiquidity: UFix64, outcomeSupply: [UFix64]) {
        let current = self.pools[marketId]
            ?? panic("unknown market")
        self.pools[marketId] = PoolState(
            marketId: marketId,
            bVector: bVector,
            liquidityParameter: current.liquidityParameter,
            totalLiquidity: totalLiquidity,
            outcomeSupply: outcomeSupply
        )
    }

    access(all) fun getPoolState(marketId: UInt64): PoolState? {
        return self.pools[marketId]
    }

    init() {
        self.marketPoolStorageRoot = "forte_marketPool_"
        self.outcomeVaultStorageRoot = "forte_outcomeVault_"
        self.tolerance = 0.0000001
        self.pools = {} as {UInt64: PoolState}
    }
}
