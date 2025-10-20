/**
 * Flow transaction templates
 * These are loaded from flow.json transaction definitions
 */

export const EXECUTE_TRADE_TRANSACTION = `
import CoreMarketHub from 0xCoreMarketHub
import LMSRAmm from 0xLMSRAmm
import OutcomeToken from 0xOutcomeToken
import FungibleToken from 0xFungibleToken
import FlowToken from 0xFlowToken

transaction(
    marketId: UInt64,
    outcomeIndex: Int,
    flowAmount: UFix64,
    outcomeAmount: UFix64,
    newBVector: [UFix64],
    newTotalLiquidity: UFix64,
    newOutcomeSupply: [UFix64],
    isBuy: Bool
) {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        let metadata = CoreMarketHub.getMarketStorageMetadata(id: marketId)
            ?? panic("market metadata missing")

        if isBuy {
            if flowAmount <= 0.0 {
                panic("flow amount must be positive")
            }
            let poolCap = getAccount(metadata.owner)
                .capabilities.get<&{LMSRAmm.PoolReceiver}>(metadata.liquidityReceiverPath)
            if !poolCap.check() {
                panic("pool receiver capability unavailable")
            }

            let withdrawRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(from: /storage/testFlowTokenVault)
                ?? panic("missing FlowToken vault reference")
            let withdrawal <- withdrawRef.withdraw(amount: flowAmount) as @{FungibleToken.Vault}
            poolCap.borrow()!.depositFlow(from: <-withdrawal)
        } else if flowAmount > 0.0 {
            let providerCap = getAccount(metadata.owner)
                .capabilities.get<&{LMSRAmm.PoolProvider}>(metadata.liquidityProviderPath)
            if !providerCap.check() {
                panic("pool provider capability unavailable")
            }
            let receiverRef = signer.storage.borrow<&FlowToken.Vault>(from: /storage/testFlowTokenVault)
                ?? panic("missing FlowToken receiver")
            providerCap.borrow()!.withdrawFlow(amount: flowAmount, to: receiverRef)
        }

        if outcomeAmount > 0.0 {
            let storagePath = metadata.outcomeVaultPath
            if isBuy {
                let receiverRef = signer.storage.borrow<&OutcomeToken.Vault>(from: storagePath)
                    ?? panic("link outcome vault first")
                let minted <- OutcomeToken.mint(marketId: marketId, amount: outcomeAmount, executor: signer.address)
                receiverRef.deposit(from: <-minted)
            } else {
                let providerRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &OutcomeToken.Vault>(from: storagePath)
                    ?? panic("provider capability missing")
                let burnVault <- providerRef.withdraw(amount: outcomeAmount)
                OutcomeToken.burn(vault: <-burnVault)
            }
        }

        LMSRAmm.syncState(
            marketId: marketId,
            bVector: newBVector,
            totalLiquidity: newTotalLiquidity,
            outcomeSupply: newOutcomeSupply
        )
    }
}
`;

export const CREATE_MARKET_TRANSACTION = `
import CoreMarketHub from 0xCoreMarketHub

transaction(
    slug: String,
    title: String,
    description: String,
    category: String,
    oracleId: String,
    useOracleId: Bool,
    closeAt: UFix64,
    useCloseAt: Bool,
    scheduledStartAt: UFix64,
    useScheduledStart: Bool,
    tradingLockAt: UFix64,
    useTradingLock: Bool,
    freezeWindowStartAt: UFix64,
    useFreezeStart: Bool,
    freezeWindowEndAt: UFix64,
    useFreezeEnd: Bool,
    patrolThreshold: UFix64,
    usePatrolThreshold: Bool,
    tags: [String],
    outcomeLabels: [String]
) {
    prepare(signer: auth(Storage, Capabilities) &Account) {
        let storagePath = CoreMarketHub.roleStoragePath(role: CoreMarketHub.Role.operator)
        let badge = signer.storage.borrow<&CoreMarketHub.RoleBadge>(from: storagePath)
            ?? panic("operator role badge is required")

        let oracleOpt: String? = useOracleId ? oracleId : nil
        let closeOpt: UFix64? = useCloseAt ? closeAt : nil
        let startOpt: UFix64? = useScheduledStart ? scheduledStartAt : nil
        let lockOpt: UFix64? = useTradingLock ? tradingLockAt : nil
        let freezeStartOpt: UFix64? = useFreezeStart ? freezeWindowStartAt : nil
        let freezeEndOpt: UFix64? = useFreezeEnd ? freezeWindowEndAt : nil
        let patrolOpt: UFix64? = usePatrolThreshold ? patrolThreshold : nil

        let marketId = CoreMarketHub.createMarket(
            operatorBadge: badge,
            slug: slug,
            title: title,
            description: description,
            categoryRaw: category,
            oracleId: oracleOpt,
            closeAt: closeOpt,
            scheduledStartAt: startOpt,
            tradingLockAt: lockOpt,
            freezeWindowStartAt: freezeStartOpt,
            freezeWindowEndAt: freezeEndOpt,
            patrolThreshold: patrolOpt,
            tags: tags,
            outcomeLabels: outcomeLabels
        )
        CoreMarketHub.activateMarket(operatorBadge: badge, id: marketId)
    }
}
`;
