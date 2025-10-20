import aiSportsEscrow from 0x4fdb077419808080

pub struct TournamentStats {
    pub let totalParticipants: UInt64
    pub let currentPrizePool: UFix64
    pub let averageScore: UFix64
    pub let activeContests: UInt64

    init(
        totalParticipants: UInt64,
        currentPrizePool: UFix64,
        averageScore: UFix64,
        activeContests: UInt64
    ) {
        self.totalParticipants = totalParticipants
        self.currentPrizePool = currentPrizePool
        self.averageScore = averageScore
        self.activeContests = activeContests
    }
}

pub fun main(): TournamentStats {
    return TournamentStats(
        totalParticipants: aiSportsEscrow.getTotalParticipants(),
        currentPrizePool: aiSportsEscrow.getCurrentPrizePool(),
        averageScore: aiSportsEscrow.getAverageScore(),
        activeContests: aiSportsEscrow.getActiveContestsCount()
    )
}
