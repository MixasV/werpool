import aiSportsEscrow from 0x4fdb077419808080

access(all) struct TournamentStats {
    access(all) let totalParticipants: UInt64
    access(all) let currentPrizePool: UFix64
    access(all) let averageScore: UFix64
    access(all) let activeContests: UInt64

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

access(all) fun main(): TournamentStats {
    return TournamentStats(
        totalParticipants: aiSportsEscrow.getTotalParticipants(),
        currentPrizePool: aiSportsEscrow.getCurrentPrizePool(),
        averageScore: aiSportsEscrow.getAverageScore(),
        activeContests: aiSportsEscrow.getActiveContestsCount()
    )
}
