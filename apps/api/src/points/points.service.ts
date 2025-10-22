import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, PointEventSource } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import {
  LeaderboardEntryDto,
  PointLedgerEntryDto,
  PointsSummaryDto,
} from "./dto/points.dto";
import { LeaderboardSnapshotDto } from "./dto/leaderboard-snapshot.dto";

interface LedgerListResult {
  entries: PointLedgerEntryDto[];
  nextCursor?: string;
}

interface LedgerListOptions {
  limit?: number;
  cursor?: string;
}

interface SnapshotQueryOptions {
  limit?: number;
  after?: string;
  before?: string;
}

interface CaptureSnapshotOptions {
  limit?: number;
  capturedAt?: Date;
}

interface RecordEventOptions {
  address: string;
  source: PointEventSource;
  amount: number;
  reference?: string;
  notes?: string;
  actor?: string;
}

interface SpendPointsOptions {
  address: string;
  amount: number;
  source?: PointEventSource;
  reference?: string;
  notes?: string;
  actor?: string;
}

@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(address: string): Promise<PointsSummaryDto> {
    const normalizedAddress = address.toLowerCase();
    const summary = await this.prisma.userPoints.upsert({
      where: { address: normalizedAddress },
      update: {},
      create: {
        address: normalizedAddress,
        total: new Prisma.Decimal(0),
      },
    });

    return {
      address: summary.address,
      total: Number(summary.total),
      updatedAt: summary.updatedAt.toISOString(),
    };
  }

  async getLedger(address: string, options: LedgerListOptions = {}): Promise<LedgerListResult> {
    const normalizedAddress = address.toLowerCase();
    const limit = options.limit && options.limit > 0 && options.limit <= 100 ? options.limit : 25;

    const ledgerEntries = await this.prisma.userPointLedger.findMany({
      where: { address: normalizedAddress },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(options.cursor
        ? {
            cursor: {
              id: options.cursor,
            },
            skip: 1,
          }
        : {}),
    });

    const hasMore = ledgerEntries.length > limit;
    const entries = ledgerEntries.slice(0, limit);

    const nextCursor = hasMore ? ledgerEntries[limit]?.id : undefined;

    return {
      entries: entries.map((entry) => this.toLedgerDto(entry)),
      nextCursor,
    };
  }

  async awardPoints(options: RecordEventOptions): Promise<PointLedgerEntryDto> {
    if (options.amount <= 0) {
      throw new BadRequestException("Points amount must be positive");
    }

    return this.recordEvent(options);
  }

  async spendPoints(options: SpendPointsOptions): Promise<PointLedgerEntryDto> {
    if (options.amount <= 0) {
      throw new BadRequestException("Points amount must be positive");
    }

    const normalizedAddress = options.address.toLowerCase();
    const spendAmount = new Prisma.Decimal(options.amount);

    const ledgerEntry = await this.prisma.$transaction(async (tx) => {
      const summary = await tx.userPoints.findUnique({
        where: { address: normalizedAddress },
      });

      if (!summary || summary.total.lessThan(spendAmount)) {
        throw new BadRequestException("Insufficient points balance");
      }

      const createdLedger = await tx.userPointLedger.create({
        data: {
          address: normalizedAddress,
          source: options.source ?? PointEventSource.ROLE_PURCHASE,
          amount: spendAmount.negated(),
          reference: options.reference ?? null,
          notes: options.notes ?? null,
          createdBy: options.actor ?? null,
        },
      });

      await tx.userPoints.update({
        where: { address: normalizedAddress },
        data: {
          total: {
            decrement: spendAmount,
          },
        },
      });

      return createdLedger;
    });

    return this.toLedgerDto(ledgerEntry);
  }

  async recordEvent(options: RecordEventOptions): Promise<PointLedgerEntryDto> {
    const normalizedAddress = options.address.toLowerCase();
    const amountDecimal = new Prisma.Decimal(options.amount);

    const ledgerEntry = await this.prisma.$transaction(async (tx) => {
      const createdLedger = await tx.userPointLedger.create({
        data: {
          address: normalizedAddress,
          source: options.source,
          amount: amountDecimal,
          reference: options.reference ?? null,
          notes: options.notes ?? null,
          createdBy: options.actor ?? null,
        },
      });

      await tx.userPoints.upsert({
        where: { address: normalizedAddress },
        update: {
          total: {
            increment: amountDecimal,
          },
        },
        create: {
          address: normalizedAddress,
          total: amountDecimal,
        },
      });

      return createdLedger;
    });

    return this.toLedgerDto(ledgerEntry);
  }

  async getLeaderboard(limit = 20): Promise<LeaderboardEntryDto[]> {
    const normalizedLimit = Math.min(Math.max(limit, 1), 100);
    const top = await this.prisma.userPoints.findMany({
      orderBy: { total: "desc" },
      take: normalizedLimit,
    });

    return top.map((entry, index) => ({
      address: entry.address,
      total: Number(entry.total),
      rank: index + 1,
    }));
  }

  async captureLeaderboardSnapshot(
    options: CaptureSnapshotOptions = {}
  ): Promise<LeaderboardSnapshotDto> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const capturedAt = options.capturedAt ? new Date(options.capturedAt) : new Date();

    const top = await this.prisma.$transaction(async (tx) => {
      const entries = await tx.userPoints.findMany({
        orderBy: { total: "desc" },
        take: limit,
      });

      await tx.leaderboardSnapshot.deleteMany({
        where: { capturedAt },
      });

      if (entries.length === 0) {
        return entries;
      }

      await tx.leaderboardSnapshot.createMany({
        data: entries.map((entry, index) => ({
          capturedAt,
          address: entry.address,
          rank: index + 1,
          total: entry.total,
        })),
      });
      return entries;
    });

    return {
      capturedAt: capturedAt.toISOString(),
      entries: top.map((entry, index) => ({
        address: entry.address,
        total: Number(entry.total),
        rank: index + 1,
      })),
    };
  }

  async getLeaderboardSnapshots(
    options: SnapshotQueryOptions = {}
  ): Promise<LeaderboardSnapshotDto[]> {
    const limit = Math.min(Math.max(options.limit ?? 5, 1), 50);
    const after = this.parseIsoDate(options.after);
    const before = this.parseIsoDate(options.before);

    const where: Prisma.LeaderboardSnapshotWhereInput = {};
    if (after || before) {
      where.capturedAt = {};
      if (after) {
        (where.capturedAt as Prisma.DateTimeFilter).gt = after;
      }
      if (before) {
        (where.capturedAt as Prisma.DateTimeFilter).lt = before;
      }
    }

    const groups = await this.prisma.leaderboardSnapshot.groupBy({
      by: ["capturedAt"],
      where,
      orderBy: { capturedAt: "desc" },
      take: limit,
    });

    const snapshots = await Promise.all(
      groups.map(async (group) => {
        const entries = await this.prisma.leaderboardSnapshot.findMany({
          where: { capturedAt: group.capturedAt },
          orderBy: { rank: "asc" },
        });
        return {
          capturedAt: group.capturedAt.toISOString(),
          entries: entries.map((entry) => ({
            address: entry.address,
            total: Number(entry.total),
            rank: entry.rank,
          })),
        } satisfies LeaderboardSnapshotDto;
      })
    );

    return snapshots.sort((a, b) => (a.capturedAt > b.capturedAt ? -1 : 1));
  }

  private toLedgerDto(entry: {
    id: string;
    address: string;
    source: PointEventSource;
    amount: Prisma.Decimal;
    reference: string | null;
    notes: string | null;
    createdAt: Date;
  }): PointLedgerEntryDto {
    return {
      id: entry.id,
      address: entry.address,
      source: entry.source,
      amount: Number(entry.amount),
      reference: entry.reference ?? undefined,
      notes: entry.notes ?? undefined,
      createdAt: entry.createdAt.toISOString(),
    };
  }

  private parseIsoDate(value?: string): Date | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }
    return parsed;
  }
}
