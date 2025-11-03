import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import OrderBookV4 from 0x3ea7ac2bcdd8bcef
import OutcomeTokenV4 from 0x3ea7ac2bcdd8bcef

// Cancel order - retrieve escrowed collateral or shares
// Buy order: returns FLOW collateral
// Sell order: returns outcome tokens
transaction(orderId: UInt64, marketId: UInt64, outcomeIndex: Int, isBuyOrder: Bool) {
    
    prepare(signer: auth(Storage, Capabilities) &Account) {
        // Cancel order and retrieve escrowed funds
        let returned <- OrderBookV4.cancelOrder(
            orderId: orderId,
            canceler: signer.address
        )
        
        // Deposit returned funds to appropriate vault
        if isBuyOrder {
            // Buy order - will receive FLOW back
            let flowReceiverRef = signer.capabilities.borrow<&{FungibleToken.Receiver}>(
                /public/flowTokenReceiver
            ) ?? panic("could not borrow Flow receiver reference")
            
            flowReceiverRef.deposit(from: <-returned)
            log("Buy order canceled, FLOW returned")
        } else {
            // Sell order - will receive outcome tokens back
            let suffix = marketId.toString().concat("_").concat(outcomeIndex.toString())
            let receiverPath = PublicPath(identifier: "forte_outcomeReceiver_".concat(suffix))!
            
            let outcomeReceiverRef = signer.capabilities.borrow<&{FungibleToken.Receiver}>(
                receiverPath
            ) ?? panic("could not borrow outcome receiver reference")
            
            outcomeReceiverRef.deposit(from: <-returned)
            log("Sell order canceled, outcome tokens returned")
        }
    }
}
