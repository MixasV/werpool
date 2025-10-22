const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export interface MFLTournament {
  id: string;
  mflTournamentId: string;
  name: string;
  startDate: string;
  endDate: string;
  participants: any[];
  winnerId?: string;
  status: string;
  marketId?: string;
  market?: any;
}

export async function fetchMFLTournaments(): Promise<MFLTournament[]> {
  const response = await fetch(`${API_BASE_URL}/mfl/tournaments`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch MFL tournaments');
  }

  return response.json();
}

export async function fetchMFLTournament(id: string): Promise<MFLTournament> {
  const response = await fetch(`${API_BASE_URL}/mfl/tournaments/${id}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch tournament');
  }

  return response.json();
}

export async function syncMFLTournaments() {
  const response = await fetch(`${API_BASE_URL}/mfl/tournaments/sync`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to sync tournaments');
  }

  return response.json();
}
