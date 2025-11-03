import SealedBettingV4 from 0x3ea7ac2bcdd8bcef

// Get sealed bet data by ID
// Returns sealed bet struct with status and reveal info
access(all) fun main(betId: UInt64): SealedBettingV4.SealedBet? {
    return SealedBettingV4.getSealedBet(betId: betId)
}
