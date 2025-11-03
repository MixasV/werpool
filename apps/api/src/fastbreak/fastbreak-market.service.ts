import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FastBreakGraphQLClient, FastBreakRun } from './fastbreak-graphql.client';
import { FastBreakSyncService } from './fastbreak-sync.service';

/**
 * FastBreak Market Service - CORRECT Architecture
 * 
 * WHAT IT DOES:
 * - Automatically creates prediction markets for FastBreak Runs
 * - Markets have outcomes based on top leaders in leaderboard
 * - Auto-settlement when Run completes using TopShot API data
 * 
 * HONEST NOTE:
 * This replaces the INCORRECT P2P challenge approach.
 * FastBreak is a MASS TOURNAMENT with thousands of participants,
 * not 1v1 challenges!
 * 
 * ARCHITECTURE:
 * 1. New FastBreak Run detected → Create prediction market
 * 2. Outcomes = Top 10 leaders + "Other"
 * 3. Users trade on outcomes (LMSR or Order Book)
 * 4. Run completes → Get winner from API → Auto-settle
 */
@Injectable()
export class FastBreakMarketService {
  private readonly logger = new Logger(FastBreakMarketService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graphqlClient: FastBreakGraphQLClient,
    private readonly syncService: FastBreakSyncService,
  ) {}

  /**
   * Check for new FastBreak Runs and create markets
   * Should be called periodically (e.g., daily or via cron)
   */
  async createMarketsForNewRuns() {
    try {
      this.logger.log('Checking for new FastBreak Runs...');

      const result = await this.graphqlClient.searchActiveFastBreakRuns();
      const runs = result.data.searchFastBreakRuns.fastBreakRuns;

      this.logger.log(`Found ${runs.length} active FastBreak Runs`);

      let created = 0;
      let skipped = 0;

      for (const run of runs) {
        const existing = await this.findMarketByRunId(run.id);

        if (existing) {
          this.logger.log(`Market already exists for run ${run.runName}`);
          skipped++;
          continue;
        }

        try {
          await this.createMarketForRun(run);
          created++;
          this.logger.log(`✅ Created market for ${run.runName}`);
        } catch (error) {
          this.logger.error(`Failed to create market for run ${run.id}:`, error);
        }
      }

      return {
        totalRuns: runs.length,
        created,
        skipped,
      };
    } catch (error) {
      this.logger.error('Failed to create markets for new runs:', error);
      throw error;
    }
  }

  /**
   * Create prediction market for specific FastBreak Run
   */
  async createMarketForRun(run: FastBreakRun) {
    try {
      this.logger.log(`Creating market for ${run.runName}...`);

      // Get top leaders from leaderboard (or use current leaders from API)
      const topLeaders = await this.getTopLeaders(run);

      if (topLeaders.length === 0) {
        this.logger.warn(`No leaders found for run ${run.id}, using placeholder outcomes`);
      }

      // Create outcomes: Top leaders + "Other"
      const outcomes = this.createOutcomes(topLeaders);

      // Calculate end date (from run end date or submission deadline)
      const closeAt = this.calculateCloseDate(run);

      // Create market in database
      const slug = this.generateSlug(run.runName);
      
      const market = await this.prisma.market.create({
        data: {
          slug,
          title: `Who will win ${run.runName}?`,
          description: `Predict the winner of FastBreak Run. The winner is determined by who has the most wins in the Run Leaderboard when the run ends.`,

          category: 'SPORTS', // FastBreak is sports category
          state: 'DRAFT', // Start as draft, admin can publish
          
          closeAt, // Market closes when Run ends
          
          outcomes: {
            create: outcomes.map((outcome, index) => ({
              label: outcome.name,
              impliedProbability: 0.1, // Equal probability initially
              liquidity: 0, // Will be set when market opens
              metadata: outcome.metadata,
            })),
          },
          
          tags: [
            'fastbreak',
            `run:${run.id}`,
            run.runName,
          ],
        },
        include: {
          outcomes: true,
        },
      });

      this.logger.log(`Market created: ${market.id} - ${market.title}`);

      return market;
    } catch (error) {
      this.logger.error('Failed to create market:', error);
      throw error;
    }
  }

  /**
   * Get top leaders for a FastBreak Run
   */
  private async getTopLeaders(run: FastBreakRun) {
    try {
      const leaders = [];

      // Get leaders from active FastBreaks in the Run
      for (const fastBreak of run.fastBreaks) {
        if (fastBreak.leader && fastBreak.leader.user) {
          leaders.push({
            username: fastBreak.leader.user.username,
            address: fastBreak.leader.user.flowAddress,
            dapperId: fastBreak.leader.user.dapperID,
            rank: fastBreak.leader.rank,
            points: fastBreak.leader.points,
          });
        }
      }

      // Remove duplicates (same user can be leader in multiple FastBreaks)
      const uniqueLeaders = [];
      const seenAddresses = new Set();

      for (const leader of leaders) {
        if (!seenAddresses.has(leader.address)) {
          uniqueLeaders.push(leader);
          seenAddresses.add(leader.address);
        }
      }

      // Sort by points (descending) and take top 10
      return uniqueLeaders
        .sort((a, b) => (b.points || 0) - (a.points || 0))
        .slice(0, 10);
    } catch (error) {
      this.logger.error('Failed to get top leaders:', error);
      return [];
    }
  }

  /**
   * Create outcomes for market
   */
  private createOutcomes(topLeaders: any[]) {
    const outcomes = topLeaders.map((leader) => ({
      name: leader.username,
      description: `${leader.username} wins the FastBreak Run`,
      metadata: {
        type: 'leader',
        address: leader.address,
        dapperId: leader.dapperId,
        initialRank: leader.rank,
        initialPoints: leader.points,
      },
    }));

    // Add "Other" outcome for anyone not in top 10
    outcomes.push({
      name: 'Other',
      description: 'Any participant not listed above wins',
      metadata: {
        type: 'other',
        address: null,
        dapperId: null,
        initialRank: null,
        initialPoints: null,
      },
    });

    return outcomes;
  }

  /**
   * Calculate market close date from Run data
   */
  private calculateCloseDate(run: FastBreakRun): Date {
    // Use runEndDate if available
    if (run.runEndDate) {
      return new Date(run.runEndDate);
    }

    // Fallback: use last FastBreak submission deadline
    if (run.fastBreaks && run.fastBreaks.length > 0) {
      const deadlines = run.fastBreaks
        .map((fb) => fb.submissionDeadline)
        .filter(Boolean)
        .map((d) => new Date(d));

      if (deadlines.length > 0) {
        return new Date(Math.max(...deadlines.map((d) => d.getTime())));
      }
    }

    // Fallback: 2 weeks from now (typical Run duration)
    return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  }

  /**
   * Find market by FastBreak Run ID
   */
  async findMarketByRunId(runId: string) {
    const markets = await this.prisma.market.findMany({
      where: {
        tags: {
          has: `run:${runId}`,
        },
      },
    });

    return markets[0] || null;
  }

  /**
   * Get all unsettled FastBreak markets
   */
  async getUnsettledFastBreakMarkets() {
    return this.prisma.market.findMany({
      where: {
        state: { in: ['LIVE', 'CLOSED'] },
        tags: {
          has: 'fastbreak',
        },
      },
      include: {
        outcomes: true,
      },
    });
  }

  /**
   * Settle markets for completed FastBreak Runs
   * Should be called periodically (e.g., daily)
   */
  async settleCompletedRuns() {
    try {
      this.logger.log('Checking for completed FastBreak Runs to settle...');

      const markets = await this.getUnsettledFastBreakMarkets();

      this.logger.log(`Found ${markets.length} unsettled FastBreak markets`);

      let settled = 0;
      let pending = 0;

      for (const market of markets) {
        try {
          // Extract runId from tags (format: "run:xxx-xxx-xxx")
          const runTag = market.tags.find((tag) => tag.startsWith('run:'));
          const runId = runTag?.replace('run:', '');

          if (!runId) {
            this.logger.warn(`Market ${market.id} missing run tag`);
            continue;
          }

          // Get Run data from API
          const runData = await this.graphqlClient.getFastBreakById(runId);

          if (!runData?.data?.getFastBreakById?.data) {
            this.logger.warn(`Could not fetch Run data for ${runId}`);
            pending++;
            continue;
          }

          const run = runData.data.getFastBreakById.data;

          // Check if Run is complete - looking for leader with most wins
          // Note: TopShot API doesn't return winner directly, need to get from leaderboard
          const leaderboard = await this.syncService.getLeaderboard(1);
          
          if (leaderboard.length === 0 || run.status === 'FAST_BREAK_OPEN') {
            this.logger.log(`Run ${runId} not yet complete (status: ${run.status})`);
            pending++;
            continue;
          }

          // Get winner from top of leaderboard
          const winner = leaderboard[0];
          const winnerAddress = winner.address;
          
          const winningOutcome = market.outcomes.find((outcome) => {
            const metadata = outcome.metadata as any;
            return metadata?.address === winnerAddress;
          });

          const winningOutcomeId = winningOutcome 
            ? winningOutcome.id
            : market.outcomes.find((o) => o.label === 'Other')!.id;

          const outcomeLabel = winningOutcome ? winningOutcome.label : 'Other';
          this.logger.log(`Settling market with outcome: ${outcomeLabel} (id ${winningOutcomeId})`);

          // Settle market
          await this.settleMarket(market.id, winningOutcomeId, winnerAddress);

          settled++;
          this.logger.log(`✅ Settled market ${market.id}`);
        } catch (error) {
          this.logger.error(`Failed to settle market ${market.id}:`, error);
        }
      }

      return {
        total: markets.length,
        settled,
        pending,
      };
    } catch (error) {
      this.logger.error('Failed to settle completed runs:', error);
      throw error;
    }
  }

  /**
   * Settle a market with specific outcome
   */
  private async settleMarket(marketId: string, winningOutcomeId: string, winnerAddress: string) {
    // Create settlement record using proper schema
    await this.prisma.settlement.create({
      data: {
        marketId,
        resolvedOutcomeId: winningOutcomeId,
        txId: `fastbreak-${Date.now()}`, // Unique TX ID
        settledAt: new Date(),
        notes: `Winner: ${winnerAddress} from FastBreak leaderboard`,
      },
    });

    // Update market state
    await this.prisma.market.update({
      where: { id: marketId },
      data: {
        state: 'SETTLED',
      },
    });
  }

  /**
   * Generate slug for market
   */
  private generateSlug(runName: string): string {
    const base = runName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    const timestamp = Date.now().toString(36);
    return `fastbreak-${base}-${timestamp}`;
  }

  /**
   * Get all FastBreak markets (for admin/user viewing)
   */
  async getAllFastBreakMarkets() {
    return this.prisma.market.findMany({
      where: {
        tags: {
          has: 'fastbreak',
        },
      },
      include: {
        outcomes: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
