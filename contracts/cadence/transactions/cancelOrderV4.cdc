import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import OrderBookV4 from 0x3ea7ac2bcdd8bcef
import OutcomeTokenV4 from 0x3ea7ac2bcdd8bcef

// Cancel order - retrieve escrowed collateral or shares
// Buy order: returns FLOW collateral
// Sell order: returns outcome tokens
transaction(orderId: UInt64, marketId: UInt64, outcomeIndex: Int, isBuyOrder: Bool) {
    
    let cancellerAddress: Address
    let flowReceiverRef: &{FungibleToken.Receiver}?
    let outcomeReceiverRef: &{FungibleToken.Receiver}?
    
    prepare(signer: auth(Storage, Capabilities) &Account) {
        self.cancellerAddress = signer.address
        
        if isBuyOrder {
            // Buy order - will receive FLOW back
            self.flowReceiverRef = signer.capabilities.borrow<&{FungibleToken.Receiver}>(
                /public/flowTokenReceiver
            ) ?? panic("could not borrow Flow receiver reference")
            self.outcomeReceiverRef = nil
        } else {
            // Sell order - will receive outcome tokens back
            let suffix = marketId.toString().concat("_").concat(outcomeIndex.toString())
            let receiverPath = PublicPath(identifier: "forte_outcomeReceiver_".concat(suffix))!
            
            self.outcomeReceiverRef = signer.capabilities.borrow<&{FungibleToken.Receiver}>(
                receiverPath
            ) ?? panic("could not borrow outcome receiver reference")
            self.flowReceiverRef = nil
        }
    }
    
    execute {
        // Cancel order and retrieve escrowed funds
        let returned <- OrderBookV4.cancelOrder(
            orderId: orderId,
            canceler: self.cancellerAddress
        )
        
        // Deposit returned funds to appropriate vault
        if isBuyOrder {
            self.flowReceiverRef!.deposit(from: <-returned)
            log("Buy order canceled, FLOW returned")
        } else {
            self.outcomeReceiverRef!.deposit(from: <-returned)
            log("Sell order canceled, outcome tokens returned")
        }
    }
}
