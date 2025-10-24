import FungibleToken from "FungibleToken"
import FlowToken from "FlowToken"
import OutcomeToken from "OutcomeToken"

access(all) struct AccountMarketBalances {
    access(all) let flowBalance: UFix64
    access(all) let outcomeBalance: UFix64

    init(flowBalance: UFix64, outcomeBalance: UFix64) {
        self.flowBalance = flowBalance
        self.outcomeBalance = outcomeBalance
    }
}

access(all) fun main(account: Address, marketId: UInt64): AccountMarketBalances {
    let flowCapability = getAccount(account)
        .getCapability<&FlowToken.Vault{FungibleToken.Balance}>(/public/flowTokenBalance)

    var flowBalance: UFix64 = 0.0
    if let vaultRef = flowCapability.borrow() {
        flowBalance = vaultRef.balance
    }

    let suffix = marketId.toString()
    let outcomePath = PublicPath(identifier: "/public/forte_outcomeBalance_".concat(suffix))!
    let outcomeCapability = getAccount(account).getCapability<&OutcomeToken.Vault>(outcomePath)

    var outcomeBalance: UFix64 = 0.0
    if let outcomeRef = outcomeCapability.borrow() {
        outcomeBalance = outcomeRef.balance
    }

    return AccountMarketBalances(
        flowBalance: flowBalance,
        outcomeBalance: outcomeBalance
    )
}
