import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import CoreMarketContractV4 from 0x3ea7ac2bcdd8bcef
import OutcomeTokenV4 from 0x3ea7ac2bcdd8bcef

// Merge complete set of outcome tokens back to FLOW collateral
// User burns equal amounts of all outcome tokens and receives FLOW back
// Example: burn 100 YES + 100 NO → receive 100 FLOW
transaction(marketId: UInt64, amount: UFix64, outcomeCount: Int) {
    
    let userAddress: Address
    let flowReceiverRef: &{FungibleToken.Receiver}
    
    prepare(signer: auth(Storage, Capabilities) &Account) {
        self.userAddress = signer.address
        
        // Get reference to user's Flow receiver
        self.flowReceiverRef = signer.capabilities.borrow<&{FungibleToken.Receiver}>(
            /public/flowTokenReceiver
        ) ?? panic("could not borrow Flow receiver reference")
    }
    
    execute {
        // Withdraw outcome tokens from user's storage
        let outcomeVaults: @{Int: {FungibleToken.Vault}} <- {}
        
        var outcomeIndex = 0
        while outcomeIndex < outcomeCount {
            let suffix = marketId.toString().concat("_").concat(outcomeIndex.toString())
            let storagePath = StoragePath(identifier: "forte_outcomeToken_".concat(suffix))!
            
            // Borrow vault reference
            let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(
                from: storagePath
            ) ?? panic("could not borrow outcome vault for outcome ".concat(outcomeIndex.toString()))
            
            // Withdraw specified amount
            let vault <- vaultRef.withdraw(amount: amount)
            outcomeVaults[outcomeIndex] <-! vault
            
            outcomeIndex = outcomeIndex + 1
        }
        
        // Merge position - burn outcome tokens and receive collateral
        let collateral <- CoreMarketContractV4.mergePosition(
            marketId: marketId,
            user: self.userAddress,
            outcomeVaults: <-outcomeVaults
        )
        
        // Deposit collateral to user's Flow vault
        self.flowReceiverRef.deposit(from: <-collateral)
    }
}
