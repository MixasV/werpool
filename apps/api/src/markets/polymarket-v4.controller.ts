import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Param, 
  BadRequestException,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { PolymarketV4Service } from './recovered/polymarket-v4.service';
import { FlowOrApiGuard } from '../auth/flow-or-api.guard';

class SplitPositionDto {
  marketId: number;
  userAddress: string;
  amount: number;
}

class MergePositionDto {
  marketId: number;
  userAddress: string;
  amount: number;
}

class RedeemWinningSharesDto {
  marketId: number;
  userAddress: string;
  winningOutcomeIndex: number;
  amount: number;
}

class CreateOrderDto {
  marketId: number;
  outcomeIndex: number;
  userAddress: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
}

class CommitSealedBetDto {
  marketId: number;
  userAddress: string;
  outcomeIndex: number;
  amount: number;
  useSealed: boolean;
}

class RevealSealedBetDto {
  betId: number;
  userAddress: string;
  outcomeIndex: number;
  salt: string;
}

class BuyOutcomeDto {
  marketId: number;
  userAddress: string;
  outcomeIndex: number;
  collateralAmount: number;
  maxSlippage?: number;
}

class SellOutcomeDto {
  marketId: number;
  userAddress: string;
  outcomeIndex: number;
  sharesAmount: number;
  maxSlippage?: number;
}

@Controller('v4/polymarket')
export class PolymarketV4Controller {
  constructor(private readonly polymarketV4Service: PolymarketV4Service) {}

  @UseGuards(FlowOrApiGuard)
  @Post('split-position')
  async splitPosition(@Body() dto: SplitPositionDto) {
    if (!dto.marketId || !dto.userAddress || !dto.amount) {
      throw new BadRequestException('marketId, userAddress, and amount are required');
    }

    if (dto.amount <= 0) {
      throw new BadRequestException('amount must be positive');
    }

    return this.polymarketV4Service.splitPosition(dto);
  }

  @UseGuards(FlowOrApiGuard)
  @Post('merge-position')
  async mergePosition(@Body() dto: MergePositionDto) {
    if (!dto.marketId || !dto.userAddress || !dto.amount) {
      throw new BadRequestException('marketId, userAddress, and amount are required');
    }

    if (dto.amount <= 0) {
      throw new BadRequestException('amount must be positive');
    }

    return this.polymarketV4Service.mergePosition(dto);
  }

  @UseGuards(FlowOrApiGuard)
  @Post('redeem-winning-shares')
  async redeemWinningShares(@Body() dto: RedeemWinningSharesDto) {
    if (!dto.marketId || !dto.userAddress || dto.winningOutcomeIndex === undefined || !dto.amount) {
      throw new BadRequestException('marketId, userAddress, winningOutcomeIndex, and amount are required');
    }

    if (dto.amount <= 0) {
      throw new BadRequestException('amount must be positive');
    }

    if (dto.winningOutcomeIndex < 0) {
      throw new BadRequestException('winningOutcomeIndex must be non-negative');
    }

    return this.polymarketV4Service.redeemWinningShares(dto);
  }

  @UseGuards(FlowOrApiGuard)
  @Post('create-order')
  async createOrder(@Body() dto: CreateOrderDto) {
    if (!dto.marketId || !dto.outcomeIndex || !dto.userAddress || !dto.side || !dto.price || !dto.size) {
      throw new BadRequestException('marketId, outcomeIndex, userAddress, side, price, and size are required');
    }

    if (dto.side !== 'buy' && dto.side !== 'sell') {
      throw new BadRequestException('side must be "buy" or "sell"');
    }

    return this.polymarketV4Service.createOrder(dto);
  }

  @Get('orderbook/:marketId/:outcomeIndex')
  async getOrderBook(
    @Param('marketId', ParseIntPipe) marketId: number,
    @Param('outcomeIndex', ParseIntPipe) outcomeIndex: number,
  ) {
    return this.polymarketV4Service.getOrderBook(marketId, outcomeIndex);
  }

  @UseGuards(FlowOrApiGuard)
  @Post('sealed-bet/commit')
  async commitSealedBet(@Body() dto: CommitSealedBetDto) {
    if (!dto.marketId || !dto.userAddress || dto.outcomeIndex === undefined || !dto.amount) {
      throw new BadRequestException('marketId, userAddress, outcomeIndex, and amount are required');
    }

    if (!dto.useSealed) {
      throw new BadRequestException('useSealed must be true for sealed bets');
    }

    if (dto.amount <= 0) {
      throw new BadRequestException('amount must be positive');
    }

    return this.polymarketV4Service.commitSealedBet(dto);
  }

  @UseGuards(FlowOrApiGuard)
  @Post('sealed-bet/reveal')
  async revealSealedBet(@Body() dto: RevealSealedBetDto) {
    if (!dto.betId || !dto.userAddress || dto.outcomeIndex === undefined || !dto.salt) {
      throw new BadRequestException('betId, userAddress, outcomeIndex, and salt are required');
    }

    return this.polymarketV4Service.revealSealedBet(dto);
  }

  @UseGuards(FlowOrApiGuard)
  @Post('buy-outcome')
  async buyOutcomeDirectly(@Body() dto: BuyOutcomeDto) {
    if (!dto.marketId || !dto.userAddress || dto.outcomeIndex === undefined || !dto.collateralAmount) {
      throw new BadRequestException('marketId, userAddress, outcomeIndex, and collateralAmount are required');
    }

    if (dto.collateralAmount <= 0) {
      throw new BadRequestException('collateralAmount must be positive');
    }

    return this.polymarketV4Service.buyOutcomeDirectly(dto);
  }

  @UseGuards(FlowOrApiGuard)
  @Post('sell-outcome')
  async sellOutcomeDirectly(@Body() dto: SellOutcomeDto) {
    if (!dto.marketId || !dto.userAddress || dto.outcomeIndex === undefined || !dto.sharesAmount) {
      throw new BadRequestException('marketId, userAddress, outcomeIndex, and sharesAmount are required');
    }

    if (dto.sharesAmount <= 0) {
      throw new BadRequestException('sharesAmount must be positive');
    }

    return this.polymarketV4Service.sellOutcomeDirectly(dto);
  }

  @Get('prices/:marketId/:outcomeIndex')
  async getEffectivePrices(
    @Param('marketId', ParseIntPipe) marketId: number,
    @Param('outcomeIndex', ParseIntPipe) outcomeIndex: number,
  ) {
    return this.polymarketV4Service.getEffectivePrices(marketId, outcomeIndex);
  }
}
