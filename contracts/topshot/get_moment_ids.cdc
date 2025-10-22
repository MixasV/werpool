import TopShot from 0x0b2a3299cc857e29

pub fun main(account: Address): [UInt64] {
    let target = getAccount(account)
    let collectionCap = target.getCapability<&{TopShot.MomentCollectionPublic}>(TopShot.CollectionPublicPath)

    if let collectionRef = collectionCap.borrow() {
        return collectionRef.getIDs()
    }

    return []
}
