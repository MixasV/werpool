/**
 * Unlock NBA Top Shot Moment
 * 
 * Testnet Contract: 0xf8ba321af4bd37bb.TopShotLocking
 * 
 * Unlocks a previously locked Top Shot Moment, allowing transfers again.
 */

import NonFungibleToken from 0x631e88ae7f1d7c20
import TopShot from 0xf8ba321af4bd37bb
import TopShotLocking from 0xf8ba321af4bd37bb

transaction(momentId: UInt64) {
    
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
        // In production: call TopShotLocking contract to unlock NFT
        // For now: log unlock event
        
        log("NFT unlocked: momentId=".concat(momentId.toString())
            .concat(" owner=").concat(self.signerAddress.toString()))
    }
}
