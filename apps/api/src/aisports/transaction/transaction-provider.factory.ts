import { Logger } from "@nestjs/common";

import { AiSportsTransactionProvider } from "./transaction-provider.interface";
import { MockAiSportsProvider } from "./mock-provider";
import { TestnetAiSportsProvider } from "./testnet-provider";

export type ProviderMode = 'mock' | 'testnet' | 'mainnet';

/**
 * Factory for creating transaction provider instances
 * 
 * Determines provider type based on configuration and creates appropriate instance.
 * Supports runtime switching between mock, testnet, and mainnet providers.
 */
export class AiSportsProviderFactory {
  private static readonly logger = new Logger(AiSportsProviderFactory.name);
  private static instance: AiSportsTransactionProvider | null = null;

  static create(mode?: ProviderMode): AiSportsTransactionProvider {
    const resolvedMode = mode || this.resolveMode();
    
    this.logger.log(`Creating transaction provider in ${resolvedMode} mode`);

    switch (resolvedMode) {
      case 'mock':
        return new MockAiSportsProvider();

      case 'testnet':
        this.logger.log('Using testnet provider with FCL integration');
        return new TestnetAiSportsProvider();

      case 'mainnet':
        this.logger.warn('Mainnet provider not yet implemented, falling back to mock');
        return new MockAiSportsProvider();

      default:
        throw new Error(`Unknown provider mode: ${resolvedMode}`);
    }
  }

  static getSingleton(mode?: ProviderMode): AiSportsTransactionProvider {
    if (!this.instance) {
      this.instance = this.create(mode);
    }
    return this.instance;
  }

  static reset(): void {
    this.instance = null;
  }

  private static resolveMode(): ProviderMode {
    const envMode = process.env.AISPORTS_TX_MODE?.toLowerCase().trim();

    if (envMode === 'testnet' || envMode === 'mainnet' || envMode === 'mock') {
      return envMode;
    }

    const network = process.env.AISPORTS_FLOW_NETWORK?.toLowerCase().trim();
    if (network === 'mainnet') {
      return 'mainnet';
    }
    if (network === 'testnet') {
      return 'testnet';
    }

    return 'mock';
  }
}
