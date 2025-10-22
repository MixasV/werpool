import { Injectable, Logger } from "@nestjs/common";

import { AiSportsNft, AiSportsNftRarity } from "../../types/aisports.types";

const RARITY_MULTIPLIERS: Record<AiSportsNftRarity, number> = {
  Common: 1.0,
  Uncommon: 1.1,
  Rare: 1.25,
  Epic: 1.5,
  Legendary: 2.0,
};

/**
 * NFT Boost Service
 * 
 * Calculates reward multipliers based on NFT rarity.
 * Higher rarity NFTs provide better rewards in markets and predictions.
 * 
 * Multipliers:
 * - Common: 1.0x (base)
 * - Uncommon: 1.1x
 * - Rare: 1.25x
 * - Epic: 1.5x
 * - Legendary: 2.0x
 */
@Injectable()
export class NFTBoostService {
  private readonly logger = new Logger(NFTBoostService.name);

  getMultiplier(rarity: AiSportsNftRarity): number {
    return RARITY_MULTIPLIERS[rarity] || RARITY_MULTIPLIERS.Common;
  }

  getBestMultiplier(nfts: readonly AiSportsNft[]): number {
    if (!nfts || nfts.length === 0) {
      return RARITY_MULTIPLIERS.Common;
    }

    const bestMultiplier = Math.max(
      ...nfts.map((nft) => this.getMultiplier(nft.rarity))
    );

    return bestMultiplier;
  }

  getBestNFT(nfts: readonly AiSportsNft[]): AiSportsNft | null {
    if (!nfts || nfts.length === 0) {
      return null;
    }

    return nfts.reduce((best, current) => {
      const bestMult = this.getMultiplier(best.rarity);
      const currentMult = this.getMultiplier(current.rarity);
      return currentMult > bestMult ? current : best;
    });
  }

  applyBoost(baseAmount: number, nfts: readonly AiSportsNft[]): number {
    const multiplier = this.getBestMultiplier(nfts);
    const boostedAmount = baseAmount * multiplier;
    
    this.logger.debug(
      `Applied ${multiplier}x boost: ${baseAmount} → ${boostedAmount}`
    );

    return boostedAmount;
  }

  calculateBoostInfo(nfts: readonly AiSportsNft[]): {
    multiplier: number;
    bestNFT: AiSportsNft | null;
    boost: number;
  } {
    const bestNFT = this.getBestNFT(nfts);
    const multiplier = this.getBestMultiplier(nfts);
    const boost = multiplier - 1.0;

    return {
      multiplier,
      bestNFT,
      boost,
    };
  }
}
