import aiSportsMinter from 0xabe5a2bf47ce5bf3
import NonFungibleToken from 0x1d7e57aa55817448

access(all) struct NFTInfo {
    access(all) let id: UInt64
    access(all) let rarity: String
    access(all) let r#type: String
    access(all) let metadata: {String: AnyStruct}

    init(id: UInt64, rarity: String, r#type: String, metadata: {String: AnyStruct}) {
        self.id = id
        self.rarity = rarity
        self.r#type = r#type
        self.metadata = metadata
    }
}

access(all) fun main(userAddress: Address): [NFTInfo] {
    let account = getAccount(userAddress)
    let capability = account.getCapability<&{NonFungibleToken.CollectionPublic}>(/public/aiSportsNFTCollection)
    let collection = capability.borrow()

    if collection == nil {
        return []
    }

    let ids = collection!.getIDs()
    var items: [NFTInfo] = []

    for id in ids {
        let rarity = aiSportsMinter.getNFTRarity(id: id)
        let nftType = aiSportsMinter.getNFTType(id: id)
        let metadata = aiSportsMinter.getNFTMetadata(id: id)

        items.append(
            NFTInfo(
                id: id,
                rarity: rarity,
                r#type: nftType,
                metadata: metadata
            )
        )
    }

    return items
}
