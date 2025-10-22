import MFL from 0x683564e46977788a

// Get all active tournaments from MFL
pub fun main(): [UInt64] {
  return MFL.getActiveTournaments()
}
