/**
 * Claim Reward in JUICE Tokens
 * 
 * Testnet Contract: 0xf8ba321af4bd37bb.aiSportsJuice
 * 
 * This transaction claims reward tokens from market winnings.
 * Assumes rewards are held in escrow and released upon claiming.
 */

import FungibleToken from 0x9a0766d93b6608b7
import aiSportsJuice from 0xf8ba321af4bd37bb

transaction(marketId: String, rewardAmount: UFix64) {
    
    let receiverRef: &{FungibleToken.Receiver}
    let signerAddress: Address
    
    prepare(signer: &Account) {
        self.signerAddress = signer.address
        
        // Get reference to recipient's JUICE receiver
        self.receiverRef = signer.capabilities
            .borrow<&{FungibleToken.Receiver}>(/public/aiSportsJuiceReceiver)
            ?? panic("Could not borrow JUICE Receiver capability!")
    }

    execute {
        // In production: withdraw from escrow and deposit to user
        // For now: log claim (needs escrow contract integration)
        
        log("Reward claimed: market=".concat(marketId)
            .concat(" amount=").concat(rewardAmount.toString())
            .concat(" recipient=").concat(self.signerAddress.toString()))
    }
}
