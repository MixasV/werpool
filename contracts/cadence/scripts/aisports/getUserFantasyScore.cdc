import aiSportsMinter from 0xabe5a2bf47ce5bf3

access(all) fun main(userAddress: Address): UFix64 {
    return aiSportsMinter.getUserTotalScore(userAddress)
}
