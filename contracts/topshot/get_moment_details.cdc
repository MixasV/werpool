import TopShot from 0x0b2a3299cc857e29

pub struct MomentDetail {
    pub let id: UInt64
    pub let playId: UInt32
    pub let setId: UInt32
    pub let serialNumber: UInt32
    pub let fullName: String?
    pub let teamName: String?
    pub let teamId: String?
    pub let primaryPosition: String?
    pub let jerseyNumber: String?
    pub let tier: String?

    init(
        id: UInt64,
        playId: UInt32,
        setId: UInt32,
        serialNumber: UInt32,
        fullName: String?,
        teamName: String?,
        teamId: String?,
        primaryPosition: String?,
        jerseyNumber: String?,
        tier: String?
    ) {
        self.id = id
        self.playId = playId
        self.setId = setId
        self.serialNumber = serialNumber
        self.fullName = fullName
        self.teamName = teamName
        self.teamId = teamId
        self.primaryPosition = primaryPosition
        self.jerseyNumber = jerseyNumber
        self.tier = tier
    }
}

pub fun main(account: Address, limit: Int?): [MomentDetail] {
    let target = getAccount(account)
    let capability = target.getCapability<&TopShot.Collection{TopShot.MomentCollectionPublic}>(/public/MomentCollection)
    let collection = capability.borrow()
    if collection == nil {
        return []
    }

    let ids = collection!.getIDs()
    var result: [MomentDetail] = []

    var count = 0
    let maxCount = limit ?? ids.length
    let sanitizedLimit = maxCount < 0 ? 0 : maxCount

    for id in ids {
        if sanitizedLimit > 0 && count >= sanitizedLimit {
            break
        }

        if let moment = collection!.borrowMoment(id: id) {
            let data = moment.data
            let metadata = TopShot.getPlayMetaData(playID: data.playID) ?? {}

            let detail = MomentDetail(
                id: id,
                playId: data.playID,
                setId: data.setID,
                serialNumber: data.serialNumber,
                fullName: metadata["FullName"],
                teamName: metadata["TeamAtMoment"],
                teamId: metadata["TeamAtMomentNBAID"],
                primaryPosition: metadata["PrimaryPosition"],
                jerseyNumber: metadata["JerseyNumber"],
                tier: metadata["Tier"]
            )

            result.append(detail)
            count = count + 1
        }
    }

    return result
}
