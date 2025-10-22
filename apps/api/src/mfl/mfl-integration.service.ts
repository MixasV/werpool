import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FlowCliService } from '../flow/flow-cli.service';
import * as fcl from '@onflow/fcl';
import { readFileSync } from 'fs';
import { join } from 'path';

interface MFLTournamentData {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  participants: Array<{ id: string; name: string }>;
  status: string;
}

@Injectable()
export class MFLIntegrationService {
  private readonly logger = new Logger(MFLIntegrationService.name);
  private readonly mflAddress = '0x683564e46977788a'; // testnet

  private getTournamentScript: string;
  private getActiveTournamentsScript: string;

  constructor(private readonly flowCliService: FlowCliService) {
    // Load Cadence scripts
    const scriptsPath = join(process.cwd(), '../contracts/cadence/scripts/mfl');
    try {
      this.getTournamentScript = readFileSync(
        join(scriptsPath, 'get_tournament.cdc'),
        'utf8',
      );
      this.getActiveTournamentsScript = readFileSync(
        join(scriptsPath, 'get_active_tournaments.cdc'),
        'utf8',
      );
    } catch (error) {
      this.logger.warn('Failed to load MFL Cadence scripts, will use mock data');
    }

    // FCL configuration will be done globally if needed
  }

  async getTournament(tournamentId: string): Promise<MFLTournamentData | null> {
    try {
      this.logger.log(`Getting tournament ${tournamentId} from MFL`);

      if (!this.getTournamentScript) {
        this.logger.warn('Cadence script not loaded, returning null');
        return null;
      }

      // Query MFL contract on testnet
      const result: any = await fcl.query({
        cadence: this.getTournamentScript,
        args: (arg: any, type: any) => [arg(tournamentId, type.UInt64)],
      });

      if (!result) {
        return null;
      }

      return {
        id: result.id.toString(),
        name: result.name,
        startDate: new Date(Number(result.startDate) * 1000),
        endDate: new Date(Number(result.endDate) * 1000),
        participants: [], // Will be populated if MFL provides this data
        status: result.status,
      };
    } catch (error) {
      this.logger.error(`Failed to get tournament ${tournamentId}:`, error);
      return null;
    }
  }

  async getTournamentWinner(tournamentId: string): Promise<string | null> {
    try {
      this.logger.log(`Getting tournament winner for ${tournamentId}`);
      
      // Mock implementation
      // In production, would query MFL contract for winner
      return null;
    } catch (error) {
      this.logger.error(`Failed to get tournament winner:`, error);
      return null;
    }
  }

  async getActiveTournaments(): Promise<MFLTournamentData[]> {
    try {
      this.logger.log('Fetching active MFL tournaments');

      if (!this.getActiveTournamentsScript) {
        this.logger.warn('Cadence script not loaded');
        return [];
      }

      // Query MFL contract for active tournament IDs
      const tournamentIds: string[] = await fcl.query({
        cadence: this.getActiveTournamentsScript,
      }) as string[];

      if (!tournamentIds || tournamentIds.length === 0) {
        return [];
      }

      // Fetch details for each tournament
      const tournaments = await Promise.all(
        tournamentIds.map((id) => this.getTournament(id)),
      );

      return tournaments.filter((t): t is MFLTournamentData => t !== null);
    } catch (error) {
      this.logger.error('Failed to get active tournaments:', error);
      return [];
    }
  }

  async getClubInfo(clubId: string) {
    try {
      this.logger.log(`Getting club info for ${clubId}`);
      
      // Mock implementation
      return null;
    } catch (error) {
      this.logger.error(`Failed to get club info:`, error);
      return null;
    }
  }
}
