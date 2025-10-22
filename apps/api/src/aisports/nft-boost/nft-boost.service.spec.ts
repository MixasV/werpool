import { NFTBoostService } from "./nft-boost.service";
import { AiSportsNft } from "../../types/aisports.types";

describe("NFTBoostService", () => {
  let service: NFTBoostService;

  beforeEach(() => {
    service = new NFTBoostService();
  });

  describe("getMultiplier", () => {
    it("should return correct multiplier for each rarity", () => {
      expect(service.getMultiplier('Common')).toBe(1.0);
      expect(service.getMultiplier('Uncommon')).toBe(1.1);
      expect(service.getMultiplier('Rare')).toBe(1.25);
      expect(service.getMultiplier('Epic')).toBe(1.5);
      expect(service.getMultiplier('Legendary')).toBe(2.0);
    });
  });

  describe("getBestMultiplier", () => {
    it("should return 1.0 for empty array", () => {
      expect(service.getBestMultiplier([])).toBe(1.0);
    });

    it("should return highest multiplier from collection", () => {
      const nfts: AiSportsNft[] = [
        { id: '1', rarity: 'Common', type: 'Card', metadata: {} },
        { id: '2', rarity: 'Epic', type: 'Card', metadata: {} },
        { id: '3', rarity: 'Rare', type: 'Card', metadata: {} },
      ];

      expect(service.getBestMultiplier(nfts)).toBe(1.5);
    });

    it("should handle single Legendary NFT", () => {
      const nfts: AiSportsNft[] = [
        { id: '1', rarity: 'Legendary', type: 'Card', metadata: {} },
      ];

      expect(service.getBestMultiplier(nfts)).toBe(2.0);
    });
  });

  describe("getBestNFT", () => {
    it("should return null for empty array", () => {
      expect(service.getBestNFT([])).toBeNull();
    });

    it("should return highest rarity NFT", () => {
      const nfts: AiSportsNft[] = [
        { id: '1', rarity: 'Common', type: 'Card', metadata: { player: 'A' } },
        { id: '2', rarity: 'Epic', type: 'Card', metadata: { player: 'B' } },
        { id: '3', rarity: 'Rare', type: 'Card', metadata: { player: 'C' } },
      ];

      const best = service.getBestNFT(nfts);
      expect(best?.id).toBe('2');
      expect(best?.rarity).toBe('Epic');
    });
  });

  describe("applyBoost", () => {
    it("should apply correct boost to base amount", () => {
      const nfts: AiSportsNft[] = [
        { id: '1', rarity: 'Rare', type: 'Card', metadata: {} },
      ];

      const boosted = service.applyBoost(100, nfts);
      expect(boosted).toBe(125);
    });

    it("should return base amount for no NFTs", () => {
      const boosted = service.applyBoost(100, []);
      expect(boosted).toBe(100);
    });

    it("should double reward for Legendary NFT", () => {
      const nfts: AiSportsNft[] = [
        { id: '1', rarity: 'Legendary', type: 'Card', metadata: {} },
      ];

      const boosted = service.applyBoost(100, nfts);
      expect(boosted).toBe(200);
    });
  });

  describe("calculateBoostInfo", () => {
    it("should return complete boost information", () => {
      const nfts: AiSportsNft[] = [
        { id: '1', rarity: 'Common', type: 'Card', metadata: {} },
        { id: '2', rarity: 'Epic', type: 'Card', metadata: { name: 'LeBron' } },
      ];

      const info = service.calculateBoostInfo(nfts);

      expect(info.multiplier).toBe(1.5);
      expect(info.bestNFT?.id).toBe('2');
      expect(info.boost).toBe(0.5);
    });

    it("should handle empty collection", () => {
      const info = service.calculateBoostInfo([]);

      expect(info.multiplier).toBe(1.0);
      expect(info.bestNFT).toBeNull();
      expect(info.boost).toBe(0);
    });
  });
});
