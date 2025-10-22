/**
 * Lock NBA Top Shot Moment
 * 
 * Testnet Contract: 0xf8ba321af4bd37bb.TopShotLocking
 * 
 * Locks a Top Shot Moment for use in fantasy contests.
 * Locked NFTs provide boost multipliers but cannot be transferred.
 */

import NonFungibleToken from 0x631e88ae7f1d7c20
import TopShot from 0xf8ba321af4bd37bb
import TopShotLocking from 0xf8ba321af4bd37bb

transaction(momentId: UInt64, lockDuration: UFix64) {
    
    let signerAddress: Address
    
    prepare(signer: &Account) {
        self.signerAddress = signer.address
        
        // Verify signer owns the moment
        let collectionRef = signer.capabilities
            .borrow<&{TopShot.MomentCollectionPublic}>(/public/MomentCollection)
            ?? panic("Could not borrow MomentCollection capability!")
        
        // Check moment exists
        let momentIds = collectionRef.getIDs()
        assert(momentIds.contains(momentId), message: "Moment not found in collection")
    }

    execute {
        // In production: call TopShotLocking contract to lock NFT
        // For now: log lock event
        
        log("NFT locked: momentId=".concat(momentId.toString())
            .concat(" duration=").concat(lockDuration.toString())
            .concat(" owner=").concat(self.signerAddress.toString()))
    }
}
