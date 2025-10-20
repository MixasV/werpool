import aiSportsMinter from 0xabe5a2bf47ce5bf3
import NonFungibleToken from 0x1d7e57aa55817448

pub struct NFTInfo {
    pub let id: UInt64
    pub let rarity: String
    pub let r#type: String
    pub let metadata: {String: AnyStruct}

    init(id: UInt64, rarity: String, r#type: String, metadata: {String: AnyStruct}) {
        self.id = id
        self.rarity = rarity
        self.r#type = r#type
        self.metadata = metadata
    }
}

pub fun main(userAddress: Address): [NFTInfo] {
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
