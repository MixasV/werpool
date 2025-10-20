import CoreMarketHub from "CoreMarketHub"
import LMSRAmm from "LMSRAmm"
import OutcomeToken from "OutcomeToken"
import FungibleToken from "FungibleToken"
import FlowToken from "FlowToken"

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
