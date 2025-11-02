import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FlowTransactionService } from '../flow/flow-transaction.service';
import { FlowSchedulerService } from '../../flow/flow-scheduler.service';
import { PointsService } from '../../points/points.service';

interface SplitPositionDto {
  marketId: number;
  userAddress: string;
  amount: number;
}

interface MergePositionDto {
  marketId: number;
  userAddress: string;
  amount: number;
}

interface RedeemWinningSharesDto {
  marketId: number;
  userAddress: string;
  winningOutcomeIndex: number;
  amount: number;
}

interface CreateOrderDto {
  marketId: number;
  outcomeIndex: number;
  userAddress: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
}

interface CommitSealedBetDto {
  marketId: number;
  userAddress: string;
  outcomeIndex: number;
  amount: number;
  useSealed: boolean;
}

interface RevealSealedBetDto {
  betId: number;
  userAddress: string;
  outcomeIndex: number;
  salt: string;
}

interface BuyOutcomeDto {
  marketId: number;
  userAddress: string;
  outcomeIndex: number;
  collateralAmount: number;
  maxSlippage?: number;
}

interface SellOutcomeDto {
  marketId: number;
  userAddress: string;
  outcomeIndex: number;
  sharesAmount: number;
  maxSlippage?: number;
}

@Injectable()
export class PolymarketV4Service {
  private readonly logger = new Logger(PolymarketV4Service.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flowTxService: FlowTransactionService,
    private readonly flowScheduler: FlowSchedulerService,
    private readonly pointsService: PointsService,
  ) {}

  async splitPosition(dto: SplitPositionDto) {
    this.logger.log(`Split position: market=${dto.marketId}, user=${dto.userAddress}, amount=${dto.amount}`);

    try {
      const txResult = await this.flowTxService.executeTransaction({
        transactionPath: './contracts/cadence/transactions/splitPositionV4.cdc',
        signer: dto.userAddress,
        arguments: [
          { type: 'UInt64', value: dto.marketId.toString() },
          { type: 'UFix64', value: dto.amount.toFixed(8) },
        ],
        network: 'testnet',
      });

      await this.prisma.marketTransactionLog.create({
        data: {
          marketId: dto.marketId.toString(),
          signer: dto.userAddress,
          type: 'EXECUTE_TRADE',
          transactionId: txResult.transactionId,
          network: 'testnet',
          payload: {
            amount: dto.amount,
          },
        },
      });

      return {
        success: true,
        txId: txResult.transactionId,
        amount: dto.amount,
      };
    } catch (error) {
      this.logger.error(`Failed to split position: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to split position: ${error.message}`);
    }
  }

  async mergePosition(dto: MergePositionDto) {
    this.logger.log(`Merge position: market=${dto.marketId}, user=${dto.userAddress}, amount=${dto.amount}`);

    try {
      const txResult = await this.flowTxService.executeTransaction({
        transactionPath: './contracts/cadence/transactions/mergePositionV4.cdc',
        signer: dto.userAddress,
        arguments: [
          { type: 'UInt64', value: dto.marketId.toString() },
          { type: 'UFix64', value: dto.amount.toFixed(8) },
        ],
      });

      await this.prisma.marketTransactionLog.create({
        data: {
          marketId: dto.marketId.toString(),
          signer: dto.userAddress,
          type: 'EXECUTE_TRADE',
          transactionId: txResult.transactionId,
          network: 'testnet',
          payload: {
            amount: dto.amount,
            collateralReturned: dto.amount,
          },
        },
      });

      return {
        success: true,
        txId: txResult.transactionId,
        collateralReturned: dto.amount,
      };
    } catch (error) {
      this.logger.error(`Failed to merge position: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to merge position: ${error.message}`);
    }
  }

  async redeemWinningShares(dto: RedeemWinningSharesDto) {
    this.logger.log(`Redeem winning shares: market=${dto.marketId}, user=${dto.userAddress}, outcome=${dto.winningOutcomeIndex}`);

    const market = await this.prisma.market.findUnique({
      where: { id: dto.marketId.toString() },
      include: { settlement: true },
    });

    if (!market) {
      throw new NotFoundException(`Market ${dto.marketId} not found`);
    }

    if (market.state !== 'SETTLED') {
      throw new BadRequestException('Market not settled yet');
    }

    if (!market.settlement) {
      throw new BadRequestException('No settlement data found');
    }

    const outcomes = await this.prisma.outcome.findMany({
      where: {
        marketId: dto.marketId.toString(),
      },
      orderBy: { id: 'asc' },
    });

    if (!outcomes[dto.winningOutcomeIndex] || outcomes[dto.winningOutcomeIndex].status !== 'SETTLED') {
      throw new BadRequestException('Invalid winning outcome');
    }

    try {
      const txResult = await this.flowTxService.executeTransaction({
        transactionPath: './contracts/cadence/transactions/redeemWinningSharesV4.cdc',
        signer: dto.userAddress,
        arguments: [
          { type: 'UInt64', value: dto.marketId.toString() },
          { type: 'Int', value: dto.winningOutcomeIndex.toString() },
          { type: 'UFix64', value: dto.amount.toFixed(8) },
        ],
      });

      await this.prisma.marketTransactionLog.create({
        data: {
          marketId: dto.marketId.toString(),
          signer: dto.userAddress,
          type: 'EXECUTE_TRADE',
          transactionId: txResult.transactionId,
          network: 'testnet',
          payload: {
            winningOutcomeIndex: dto.winningOutcomeIndex,
            shares: dto.amount,
            collateralReturned: dto.amount,
          },
        },
      });

      return {
        success: true,
        txId: txResult.transactionId,
        collateralReturned: dto.amount,
      };
    } catch (error) {
      this.logger.error(`Failed to redeem winning shares: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to redeem: ${error.message}`);
    }
  }

  async createOrder(dto: CreateOrderDto) {
    this.logger.log(`Create order: market=${dto.marketId}, side=${dto.side}, price=${dto.price}, size=${dto.size}`);

    if (dto.price <= 0 || dto.price >= 1) {
      throw new BadRequestException('Price must be between 0 and 1');
    }

    if (dto.size <= 0) {
      throw new BadRequestException('Size must be positive');
    }

    try {
      const transactionPath = dto.side === 'buy'
        ? './contracts/cadence/transactions/createBuyOrderV4.cdc'
        : './contracts/cadence/transactions/createSellOrderV4.cdc';

      const txResult = await this.flowTxService.executeTransaction({
        transactionPath,
        signer: dto.userAddress,
        arguments: [
          { type: 'UInt64', value: dto.marketId.toString() },
          { type: 'Int', value: dto.outcomeIndex.toString() },
          { type: 'UFix64', value: dto.price.toFixed(8) },
          { type: 'UFix64', value: dto.size.toFixed(8) },
        ],
        network: 'testnet',
      });

      await this.prisma.marketTransactionLog.create({
        data: {
          marketId: dto.marketId.toString(),
          signer: dto.userAddress,
          type: 'EXECUTE_TRADE',
          transactionId: txResult.transactionId,
          network: 'testnet',
          payload: {
            outcomeIndex: dto.outcomeIndex,
            side: dto.side,
            price: dto.price,
            size: dto.size,
          },
        },
      });

      return {
        success: true,
        txId: txResult.transactionId,
        side: dto.side,
        price: dto.price,
        size: dto.size,
      };
    } catch (error) {
      this.logger.error(`Failed to create order: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to create order: ${error.message}`);
    }
  }

  async getOrderBook(marketId: number, outcomeIndex: number) {
    this.logger.log(`Get order book: market=${marketId}, outcome=${outcomeIndex}`);

    try {
      const orderBook = await this.flowTxService.executeScript({
        scriptPath: './contracts/cadence/scripts/getOrderBookV4.cdc',
        arguments: [
          { type: 'UInt64', value: marketId.toString() },
          { type: 'Int', value: outcomeIndex.toString() },
        ],
      });

      return orderBook;
    } catch (error) {
      this.logger.error(`Failed to get order book: ${error.message}`, error.stack);
      return { buy: [], sell: [] };
    }
  }

  async commitSealedBet(dto: CommitSealedBetDto) {
    this.logger.log(`Commit sealed bet: market=${dto.marketId}, user=${dto.userAddress}, outcome=${dto.outcomeIndex}`);

    if (!dto.useSealed) {
      throw new BadRequestException('useSealed must be true for sealed bets');
    }

    try {
      const salt = this.generateRandomSalt();

      const market = await this.prisma.market.findUnique({
        where: { id: dto.marketId.toString() },
      });

      if (!market) {
        throw new NotFoundException(`Market ${dto.marketId} not found`);
      }

      const autoRevealScheduledFor = new Date(market.closeAt);
      autoRevealScheduledFor.setDate(autoRevealScheduledFor.getDate() + 30);

      let autoRevealTxId: string | null = null;
      try {
        const scheduleResult = await this.flowScheduler.scheduleAutoReveal(
          0, 
          market.closeAt,
          dto.userAddress,
        );
        autoRevealTxId = scheduleResult.scheduledTxId;
        this.logger.log(`Scheduled auto-reveal: txId=${autoRevealTxId}, time=${autoRevealScheduledFor.toISOString()}`);
      } catch (error) {
        this.logger.warn(`Failed to schedule auto-reveal, will use cron fallback: ${error.message}`);
        autoRevealTxId = null;
      }

      const txResult = await this.flowTxService.executeTransaction({
        transactionPath: './contracts/cadence/transactions/commitSealedBetV4.cdc',
        signer: dto.userAddress,
        arguments: [
          { type: 'UInt64', value: dto.marketId.toString() },
          { type: 'Int', value: dto.outcomeIndex.toString() },
          { type: 'UFix64', value: dto.amount.toFixed(8) },
          { type: 'String', value: salt },
          { type: 'Optional', value: autoRevealTxId },
          { type: 'Optional', value: autoRevealScheduledFor.getTime() / 1000 },
        ],
      });

      await this.prisma.sealedBet.create({
        data: {
          marketId: dto.marketId.toString(),
          userAddress: dto.userAddress,
          amount: dto.amount,
          encryptedSalt: this.encryptSalt(salt),
          outcomeIndex: dto.outcomeIndex,
          status: 'COMMITTED',
          commitTime: new Date(),
          autoRevealScheduledFor,
          transactionHash: txResult.transactionId,
        },
      });

      return {
        success: true,
        txId: txResult.transactionId,
        autoRevealScheduledFor: autoRevealScheduledFor.toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to commit sealed bet: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to commit sealed bet: ${error.message}`);
    }
  }

  async revealSealedBet(dto: RevealSealedBetDto) {
    this.logger.log(`Reveal sealed bet: betId=${dto.betId}, user=${dto.userAddress}`);

    const sealedBet = await this.prisma.sealedBet.findUnique({
      where: { id: dto.betId.toString() },
    });

    if (!sealedBet) {
      throw new NotFoundException(`Sealed bet ${dto.betId} not found`);
    }

    if (sealedBet.userAddress !== dto.userAddress) {
      throw new BadRequestException('Not your bet');
    }

    if (sealedBet.status !== 'COMMITTED') {
      throw new BadRequestException('Bet already revealed');
    }

    try {
      const txResult = await this.flowTxService.executeTransaction({
        transactionPath: './contracts/cadence/transactions/revealSealedBetV4.cdc',
        signer: dto.userAddress,
        arguments: [
          { type: 'UInt64', value: dto.betId.toString() },
          { type: 'Int', value: dto.outcomeIndex.toString() },
          { type: 'String', value: dto.salt },
        ],
      });

      await this.prisma.sealedBet.update({
        where: { id: dto.betId.toString() },
        data: {
          status: 'REVEALED',
          revealTime: new Date(),
          revealTransactionHash: txResult.transactionId,
        },
      });

      return {
        success: true,
        txId: txResult.transactionId,
        revealedOutcome: dto.outcomeIndex,
      };
    } catch (error) {
      this.logger.error(`Failed to reveal sealed bet: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to reveal: ${error.message}`);
    }
  }

  private generateRandomSalt(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  private encryptSalt(salt: string): string {
    return Buffer.from(salt).toString('base64');
  }

  private decryptSalt(encryptedSalt: string): string {
    return Buffer.from(encryptedSalt, 'base64').toString('utf-8');
  }

  async buyOutcomeDirectly(dto: BuyOutcomeDto) {
    this.logger.log(`Prepare buy outcome: market=${dto.marketId}, outcome=${dto.outcomeIndex}, amount=${dto.collateralAmount}`);

    const effectivePrices = await this.getEffectivePrices(dto.marketId, dto.outcomeIndex);
    const maxSlippage = dto.maxSlippage ?? 0.05;
    const minEffectivePrice = effectivePrices.buyPrice * (1 + maxSlippage);

    this.logger.log(`Current buy price: ${effectivePrices.buyPrice}, max allowed: ${minEffectivePrice}`);

    const fs = require('fs');
    const path = require('path');
    const txPath = path.join(process.cwd(), '../../contracts/cadence/transactions/buyOutcomeDirectlyV4.cdc');
    let cadenceCode = fs.readFileSync(txPath, 'utf-8');

    const network = 'testnet';
    cadenceCode = cadenceCode
      .replace(/import FungibleToken from "FungibleToken"/, 'import FungibleToken from 0x9a0766d93b6608b7')
      .replace(/import FlowToken from "FlowToken"/, 'import FlowToken from 0x7e60df042a9c0868')
      .replace(/import CoreMarketContractV4 from "CoreMarketContractV4"/, 'import CoreMarketContractV4 from 0x3ea7ac2bcdd8bcef')
      .replace(/import OutcomeTokenV4 from "OutcomeTokenV4"/, 'import OutcomeTokenV4 from 0x3ea7ac2bcdd8bcef')
      .replace(/import OrderBookV4 from "OrderBookV4"/, 'import OrderBookV4 from 0x3ea7ac2bcdd8bcef');

    return {
      cadence: cadenceCode,
      arguments: [
        { type: 'UInt64', value: dto.marketId.toString() },
        { type: 'Int', value: dto.outcomeIndex.toString() },
        { type: 'UFix64', value: dto.collateralAmount.toFixed(8) },
        { type: 'UFix64', value: minEffectivePrice.toFixed(8) },
      ],
      effectivePrices,
      maxSlippage,
    };
  }

  async sellOutcomeDirectly(dto: SellOutcomeDto) {
    this.logger.log(`Prepare sell outcome: market=${dto.marketId}, outcome=${dto.outcomeIndex}, shares=${dto.sharesAmount}`);

    const effectivePrices = await this.getEffectivePrices(dto.marketId, dto.outcomeIndex);
    const maxSlippage = dto.maxSlippage ?? 0.05;
    const maxEffectivePrice = effectivePrices.sellPrice * (1 - maxSlippage);

    this.logger.log(`Current sell price: ${effectivePrices.sellPrice}, min allowed: ${maxEffectivePrice}`);

    const fs = require('fs');
    const path = require('path');
    const txPath = path.join(process.cwd(), '../../contracts/cadence/transactions/sellOutcomeDirectlyV4.cdc');
    let cadenceCode = fs.readFileSync(txPath, 'utf-8');

    const network = 'testnet';
    cadenceCode = cadenceCode
      .replace(/import FungibleToken from "FungibleToken"/, 'import FungibleToken from 0x9a0766d93b6608b7')
      .replace(/import FlowToken from "FlowToken"/, 'import FlowToken from 0x7e60df042a9c0868')
      .replace(/import CoreMarketContractV4 from "CoreMarketContractV4"/, 'import CoreMarketContractV4 from 0x3ea7ac2bcdd8bcef')
      .replace(/import OutcomeTokenV4 from "OutcomeTokenV4"/, 'import OutcomeTokenV4 from 0x3ea7ac2bcdd8bcef')
      .replace(/import OrderBookV4 from "OrderBookV4"/, 'import OrderBookV4 from 0x3ea7ac2bcdd8bcef');

    return {
      cadence: cadenceCode,
      arguments: [
        { type: 'UInt64', value: dto.marketId.toString() },
        { type: 'Int', value: dto.outcomeIndex.toString() },
        { type: 'UFix64', value: dto.sharesAmount.toFixed(8) },
        { type: 'UFix64', value: maxEffectivePrice.toFixed(8) },
      ],
      effectivePrices,
      maxSlippage,
    };
  }

  async getEffectivePrices(marketId: number, outcomeIndex: number) {
    this.logger.log(`Get effective prices: market=${marketId}, outcome=${outcomeIndex}`);

    try {
      const prices = await this.flowTxService.executeScript({
        scriptPath: './contracts/cadence/scripts/getEffectivePricesV4.cdc',
        arguments: [
          { type: 'UInt64', value: marketId.toString() },
          { type: 'Int', value: outcomeIndex.toString() },
        ],
      });

      const resultMatch = prices.result.match(/Result:\s*"(.+)"/s);
      if (!resultMatch) {
        throw new Error(`Unexpected script output: ${prices.result}`);
      }

      const jsonStr = resultMatch[1].replace(/\\"/g, '"');
      const parsed = JSON.parse(jsonStr);

      return {
        buyPrice: parseFloat(parsed.buyPrice),
        sellPrice: parseFloat(parsed.sellPrice),
        spread: parseFloat(parsed.spread),
        currentProbability: parseFloat(parsed.currentProbability),
        allProbabilities: parsed.allProbabilities.map((p: string) => parseFloat(p)),
      };
    } catch (error) {
      this.logger.error(`Failed to get effective prices: ${error.message}`, error.stack);
      return {
        buyPrice: 0.5,
        sellPrice: 0.5,
        spread: 0.0,
        currentProbability: 0.5,
        allProbabilities: [0.5, 0.5],
      };
    }
  }
}
