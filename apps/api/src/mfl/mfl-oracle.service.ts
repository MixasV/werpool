import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MFLIntegrationService } from './mfl-integration.service';
import { MarketsService } from '../markets/markets.service';
import { MarketCategory, MarketState } from '@prisma/client';

@Injectable()
export class MFLOracleService {
  private readonly logger = new Logger(MFLOracleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mflIntegration: MFLIntegrationService,
    private readonly marketsService: MarketsService,
  ) {}

  async syncTournaments() {
    try {
      this.logger.log('Syncing MFL tournaments');
      
      const tournaments = await this.mflIntegration.getActiveTournaments();
      
      for (const tournament of tournaments) {
        const existing = await this.prisma.mFLTournament.findUnique({
          where: { mflTournamentId: tournament.id },
        });

        if (!existing) {
          await this.createTournamentMarket(tournament);
        }
      }

      this.logger.log(`Synced ${tournaments.length} tournaments`);
    } catch (error) {
      this.logger.error('Failed to sync tournaments:', error);
    }
  }

  private async createTournamentMarket(tournament: any) {
    try {
      this.logger.log(`Creating market for tournament: ${tournament.name}`);

      // Create outcomes from participants
      const outcomes = tournament.participants.map((club: any) => ({
        label: club.name,
        impliedProbability: 1 / tournament.participants.length,
        liquidity: 0,
        metadata: { clubId: club.id },
      }));

      // Create market
      const market = await this.prisma.market.create({
        data: {
          title: `MFL Tournament: ${tournament.name}`,
          slug: `mfl-${tournament.id}`,
          description: `Which club will win ${tournament.name}?`,
          state: MarketState.DRAFT,
          category: MarketCategory.SPORTS,
          closeAt: tournament.startDate,
          tags: ['mfl', 'football', 'tournament'],
          outcomes: {
            create: outcomes,
          },
        },
        include: {
          outcomes: true,
        },
      });

      // Store tournament reference
      await this.prisma.mFLTournament.create({
        data: {
          mflTournamentId: tournament.id,
          name: tournament.name,
          startDate: tournament.startDate,
          endDate: tournament.endDate,
          participants: tournament.participants,
          status: 'UPCOMING',
          marketId: market.id,
        },
      });

      this.logger.log(`Created market ${market.id} for tournament ${tournament.id}`);
      return market;
    } catch (error) {
      this.logger.error(`Failed to create tournament market:`, error);
      throw error;
    }
  }

  async settleTournamentMarket(tournamentId: string) {
    try {
      const tournament = await this.prisma.mFLTournament.findUnique({
        where: { mflTournamentId: tournamentId },
        include: { market: { include: { outcomes: true } } },
      });

      if (!tournament || !tournament.market) {
        throw new NotFoundException('Tournament market not found');
      }

      // Get winner from MFL contract
      const winnerId = await this.mflIntegration.getTournamentWinner(tournamentId);

      if (!winnerId) {
        throw new Error('Tournament not completed yet');
      }

      // Find winning outcome
      const winningOutcome = tournament.market.outcomes.find(
        (outcome: any) => outcome.metadata?.clubId === winnerId,
      );

      if (!winningOutcome) {
        throw new Error('Winning outcome not found');
      }

      // TODO: Integrate with actual markets settlement
      // await this.marketsService.settleMarket(...)

      // Update tournament status
      await this.prisma.mFLTournament.update({
        where: { id: tournament.id },
        data: {
          status: 'COMPLETED',
          winnerId,
        },
      });

      this.logger.log(`Settled tournament ${tournamentId}, winner: ${winnerId}`);

      return { winnerId, outcomeId: winningOutcome.id };
    } catch (error) {
      this.logger.error(`Failed to settle tournament market:`, error);
      throw error;
    }
  }
}
