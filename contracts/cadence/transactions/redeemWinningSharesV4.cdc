import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import CoreMarketContractV4 from 0x3ea7ac2bcdd8bcef
import OutcomeTokenV4 from 0x3ea7ac2bcdd8bcef

// Redeem winning outcome tokens for FLOW collateral (1:1)
// After market settlement, users can burn winning outcome tokens for FLOW
// Example: market settles YES, burn 100 YES → receive 100 FLOW
transaction(marketId: UInt64, winningOutcomeIndex: Int, amount: UFix64) {
    
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
        // Generate storage path for winning outcome
        let suffix = marketId.toString().concat("_").concat(winningOutcomeIndex.toString())
        let storagePath = StoragePath(identifier: "forte_outcomeToken_".concat(suffix))!
        
        // Borrow winning outcome vault
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>(
            from: storagePath
        ) ?? panic("could not borrow winning outcome vault")
        
        // Withdraw winning shares
        let winningVault <- vaultRef.withdraw(amount: amount)
        
        // Redeem for collateral (1:1)
        let collateral <- CoreMarketContractV4.redeemWinningShares(
            marketId: marketId,
            user: self.userAddress,
            winningVault: <-winningVault
        )
        
        // Deposit collateral to user's Flow vault
        self.flowReceiverRef.deposit(from: <-collateral)
    }
}
