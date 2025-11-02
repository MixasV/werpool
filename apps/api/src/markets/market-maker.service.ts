import { Injectable, Logger } from '@nestjs/common';
import { PolymarketV4Service } from './recovered/polymarket-v4.service';
import { PrismaService } from '../prisma/prisma.service';

interface Outcome {
  index: number;
  label: string;
  impliedProbability: number;
}

interface MarketMakerConfig {
  orderSize: number;
  spread: number;
  adminAddress: string;
}

@Injectable()
export class MarketMakerService {
  private readonly logger = new Logger(MarketMakerService.name);
  private readonly config: MarketMakerConfig;

  constructor(
    private readonly polymarketV4Service: PolymarketV4Service,
    private readonly prisma: PrismaService,
  ) {
    this.config = {
      orderSize: parseInt(process.env.MARKET_MAKER_ORDER_SIZE || '1000', 10),
      spread: parseFloat(process.env.MARKET_MAKER_SPREAD || '0.05'),
      adminAddress: process.env.FLOW_ADMIN_ADDRESS || '',
    };

    this.logger.log(`Market Maker initialized: orderSize=${this.config.orderSize}, spread=${this.config.spread}`);
  }

  async initializeMarket(marketId: number, outcomes: Outcome[]): Promise<void> {
    this.logger.log(`Initializing market maker for market ${marketId} with ${outcomes.length} outcomes`);

    try {
      const splitResult = await this.polymarketV4Service.splitPosition({
        marketId,
        userAddress: this.config.adminAddress,
        amount: this.config.orderSize,
      });

      this.logger.log(`Split position successful: txId=${splitResult.txId}`);

      for (const outcome of outcomes) {
        const halfSpread = this.config.spread / 2;
        const sellPrice = outcome.impliedProbability + halfSpread;
        const buyPrice = outcome.impliedProbability - halfSpread;

        const sellPriceClamped = Math.max(0.01, Math.min(0.99, sellPrice));
        const buyPriceClamped = Math.max(0.01, Math.min(0.99, buyPrice));

        try {
          const sellOrderResult = await this.polymarketV4Service.createOrder({
            marketId,
            outcomeIndex: outcome.index,
            userAddress: this.config.adminAddress,
            side: 'sell',
            price: sellPriceClamped,
            size: this.config.orderSize,
          });

          this.logger.log(`Created sell order for ${outcome.label}: price=${sellPriceClamped}, txId=${sellOrderResult.txId}`);
        } catch (error) {
          this.logger.error(`Failed to create sell order for ${outcome.label}: ${error.message}`);
        }

        await this.sleep(1000);

        try {
          const buyOrderResult = await this.polymarketV4Service.createOrder({
            marketId,
            outcomeIndex: outcome.index,
            userAddress: this.config.adminAddress,
            side: 'buy',
            price: buyPriceClamped,
            size: this.config.orderSize * 0.5,
          });

          this.logger.log(`Created buy order for ${outcome.label}: price=${buyPriceClamped}, txId=${buyOrderResult.txId}`);
        } catch (error) {
          this.logger.error(`Failed to create buy order for ${outcome.label}: ${error.message}`);
        }

        await this.sleep(1000);
      }

      this.logger.log(`Market maker initialization complete for market ${marketId}`);
    } catch (error) {
      this.logger.error(`Failed to initialize market maker: ${error.message}`, error.stack);
      throw error;
    }
  }

  async rebalanceMarket(marketId: number): Promise<void> {
    this.logger.log(`Rebalancing market ${marketId} (not implemented yet)`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
