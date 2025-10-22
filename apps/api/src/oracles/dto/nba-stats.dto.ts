export interface NBAPlayerStatsDto {
  playerId: number;
  playerName: string;
  teamName: string;
  teamAbbreviation: string;
  gameId: number;
  gameDate: string;
  minutes: string | null;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  plusMinus: number | null;
  performanceScore: number;
}

export interface NBAGameDto {
  id: number;
  date: string;
  season: number;
  status: string;
  homeTeam: {
    id: number;
    name: string;
    abbreviation: string;
    score: number;
  };
  awayTeam: {
    id: number;
    name: string;
    abbreviation: string;
    score: number;
  };
}

export interface NBAPlayerDto {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  position: string;
  jerseyNumber: string | null;
  team: {
    id: number;
    name: string;
    abbreviation: string;
  };
}
