import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * FastBreak Leaderboard Scraper Service
 * 
 * HONEST NOTE: NBA TopShot does NOT provide public GraphQL API for FastBreak leaderboard.
 * This service provides a framework for scraping or manually importing leaderboard data.
 * 
 * OPTIONS:
 * 1. Web scraping (may violate TOS - admin responsibility)
 * 2. Manual CSV import
 * 3. Custom integration if TopShot provides private API access
 * 
 * CURRENT: Provides methods for manual data import
 */
@Injectable()
export class FastBreakScraperService {
  private readonly logger = new Logger(FastBreakScraperService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Import leaderboard from array of entries
   * Admin can call this via API endpoint
   */
  async importLeaderboard(entries: Array<{
    address: string;
    username: string;
    rank: number;
    score: number;
  }>, week?: number, year?: number) {
    const currentWeek = week || this.getCurrentWeekNumber();
    const currentYear = year || new Date().getFullYear();

    this.logger.log(`Importing ${entries.length} leaderboard entries for week ${currentWeek}, year ${currentYear}`);

    for (const entry of entries) {
      await this.prisma.fastBreakLeaderboard.upsert({
        where: {
          week_year_address: {
            week: currentWeek,
            year: currentYear,
            address: entry.address,
          },
        },
        create: {
          week: currentWeek,
          year: currentYear,
          address: entry.address,
          username: entry.username,
          rank: entry.rank,
          score: entry.score,
        },
        update: {
          username: entry.username,
          rank: entry.rank,
          score: entry.score,
        },
      });
    }

    this.logger.log(`Successfully imported ${entries.length} entries`);

    return {
      imported: entries.length,
      week: currentWeek,
      year: currentYear,
    };
  }

  /**
   * Import leaderboard from CSV string
   * Format: address,username,rank,score
   */
  async importFromCSV(csv: string, week?: number, year?: number) {
    const lines = csv.trim().split('\n');
    const entries = [];

    // Skip header if exists
    const startIndex = lines[0].includes('address') ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const [address, username, rank, score] = line.split(',').map(v => v.trim());
      
      entries.push({
        address,
        username,
        rank: parseInt(rank, 10),
        score: parseFloat(score),
      });
    }

    return this.importLeaderboard(entries, week, year);
  }

  /**
   * Placeholder for automated scraping
   * NOTE: Web scraping may violate TopShot TOS
   * Admin should implement if they have legal access to data
   */
  // @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async autoScrapeLeaderboard() {
    this.logger.warn(
      'Auto-scraping is disabled by default. ' +
      'If you have legal access to FastBreak data, implement scraping here.'
    );

    // IMPLEMENTATION NOTE:
    // If admin has permission to scrape or access alternative data source:
    // 1. Fetch data from source
    // 2. Parse into entries array
    // 3. Call this.importLeaderboard(entries)
    
    return { status: 'disabled' };
  }

  private getCurrentWeekNumber(): number {
    const now = new Date();
    const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
    const pastDaysOfYear = (now.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }
}
