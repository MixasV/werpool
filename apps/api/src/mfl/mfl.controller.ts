import { Controller, Get, Param, Post } from '@nestjs/common';
import { MFLOracleService } from './mfl-oracle.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('mfl')
export class MFLController {
  constructor(
    private readonly mflOracle: MFLOracleService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('tournaments')
  async getTournaments() {
    return this.prisma.mFLTournament.findMany({
      include: { market: true },
      orderBy: { startDate: 'desc' },
    });
  }

  @Get('tournaments/:id')
  async getTournament(@Param('id') id: string) {
    return this.prisma.mFLTournament.findUnique({
      where: { id },
      include: {
        market: {
          include: {
            outcomes: true,
            poolState: true,
          },
        },
      },
    });
  }

  @Post('tournaments/sync')
  async syncTournaments() {
    await this.mflOracle.syncTournaments();
    return { message: 'Tournaments synced successfully' };
  }
}
