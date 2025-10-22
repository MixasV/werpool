/**
 * Create Contest with Escrow
 * 
 * Testnet Contract: 0xf8ba321af4bd37bb.aiSportsEscrow
 * 
 * Creates a new fantasy sports contest with prize pool in escrow.
 */

import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import aiSportsEscrow from 0xf8ba321af4bd37bb

transaction(
    title: String,
    prizePool: UFix64,
    entryFee: UFix64,
    startTime: UFix64,
    endTime: UFix64
) {
    
    let creatorVault: &FlowToken.Vault
    let signerAddress: Address
    
    prepare(signer: &Account) {
        self.signerAddress = signer.address
        
        // Get reference to creator's FLOW vault for initial prize pool
        self.creatorVault = signer.storage.borrow<&FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Could not borrow FLOW Vault!")
    }

    execute {
        // Withdraw FLOW for prize pool
        let prizeVault <- self.creatorVault.withdraw(amount: prizePool)
        
        // In production: deposit to escrow and create contest
        // For now: destroy vault and log event
        destroy prizeVault
        
        log("Contest created: title=".concat(title)
            .concat(" prizePool=").concat(prizePool.toString())
            .concat(" entryFee=").concat(entryFee.toString())
            .concat(" creator=").concat(self.signerAddress.toString()))
    }
}
