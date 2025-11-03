import FungibleToken from 0x9a0766d93b6608b7
import OutcomeTokenV4 from 0x3ea7ac2bcdd8bcef

// Get user's outcome token balances for a market
// Returns array of balances, one for each outcome
// Returns nil if user doesn't have vaults for this market
access(all) fun main(userAddress: Address, marketId: UInt64, outcomeCount: Int): [UFix64] {
    let account = getAccount(userAddress)
    let balances: [UFix64] = []
    
    var outcomeIndex = 0
    while outcomeIndex < outcomeCount {
        // Generate storage path for this outcome
        let suffix = marketId.toString().concat("_").concat(outcomeIndex.toString())
        let balancePath = PublicPath(identifier: "forte_outcomeBalance_".concat(suffix))!
        
        // Try to borrow balance capability
        if let balanceRef = account.capabilities.borrow<&{FungibleToken.Balance}>(balancePath) {
            balances.append(balanceRef.balance)
        } else {
            // User doesn't have this outcome token yet
            balances.append(0.0)
        }
        
        outcomeIndex = outcomeIndex + 1
    }
    
    return balances
}
