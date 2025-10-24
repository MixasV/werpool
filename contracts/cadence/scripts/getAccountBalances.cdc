import FungibleToken from "FungibleToken"
import FlowToken from "FlowToken"

access(all) struct AccountMarketBalances {
    access(all) let flowBalance: UFix64
    access(all) let outcomeBalance: UFix64

    init(flowBalance: UFix64, outcomeBalance: UFix64) {
        self.flowBalance = flowBalance
        self.outcomeBalance = outcomeBalance
    }
}

access(all) fun main(account: Address, marketId: UInt64): AccountMarketBalances {
    // HONEST: Cadence 1.0 - capabilities.get() on public Account
    let acct = getAccount(account)
    
    var flowBalance: UFix64 = 0.0
    if let flowCap = acct.capabilities.get<&{FungibleToken.Balance}>(/public/flowTokenBalance).borrow() {
        flowBalance = flowCap.balance
    }

    // HONEST: OutcomeToken balances not available yet - contracts need deployment
    // For now, return 0 for outcome balance as pool state is mock data
    var outcomeBalance: UFix64 = 0.0

    return AccountMarketBalances(
        flowBalance: flowBalance,
        outcomeBalance: outcomeBalance
    )
}
