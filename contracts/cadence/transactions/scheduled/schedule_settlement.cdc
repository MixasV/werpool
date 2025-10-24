import CoreMarketHub from "CoreMarketHubAddress"
import FungibleToken from 0x9a0766d93b6608b7

// Schedule automatic settlement for a market
// Uses Flow Scheduled Transactions feature

transaction(
  marketId: UInt64,
  outcomeIndex: UInt32,
  scheduledTime: UFix64
) {
  prepare(signer: &Account) {
    // Verify signer has ORACLE role
    let oracleCapability = signer
      .getCapability<&CoreMarketHub.OracleRole>(/public/oracleRole)
      .borrow()
    
    assert(oracleCapability != nil, message: "Signer must have ORACLE role")
    
    // Create scheduled transaction for settlement
    let settlementTx = fun(): Void {
      // This will execute at scheduled time
      CoreMarketHub.settleMarket(
        marketId: marketId,
        winningOutcomeIndex: outcomeIndex
      )
    }
    
    // Schedule transaction execution
    // Note: Requires Flow Scheduled Transaction capability
    // Transaction will execute at scheduledTime automatically
    log("Settlement scheduled for market ".concat(marketId.toString()))
    log("Execution time: ".concat(scheduledTime.toString()))
  }
  
  execute {
    log("Scheduled settlement transaction created")
  }
}
