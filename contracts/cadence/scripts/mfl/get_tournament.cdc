import MFL from 0x683564e46977788a

// Get tournament details from MFL contract
pub fun main(tournamentId: UInt64): TournamentData? {
  let tournament = MFL.getTournament(tournamentId: tournamentId)
  
  if tournament == nil {
    return nil
  }
  
  return TournamentData(
    id: tournament!.id,
    name: tournament!.name,
    status: tournament!.status,
    startDate: tournament!.startDate,
    endDate: tournament!.endDate,
    participantCount: tournament!.participantCount,
    winner: tournament!.winner
  )
}

pub struct TournamentData {
  pub let id: UInt64
  pub let name: String
  pub let status: String
  pub let startDate: UFix64
  pub let endDate: UFix64
  pub let participantCount: UInt32
  pub let winner: Address?
  
  init(
    id: UInt64,
    name: String,
    status: String,
    startDate: UFix64,
    endDate: UFix64,
    participantCount: UInt32,
    winner: Address?
  ) {
    self.id = id
    self.name = name
    self.status = status
    self.startDate = startDate
    self.endDate = endDate
    self.participantCount = participantCount
    self.winner = winner
  }
}
