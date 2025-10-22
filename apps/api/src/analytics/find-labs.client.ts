import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class FindLabsClient {
  private readonly baseUrl = process.env.FIND_LABS_BASE_URL || 'https://api.test-find.xyz';
  private readonly apiKey = process.env.FIND_LABS_API_KEY;
  private readonly logger = new Logger(FindLabsClient.name);

  constructor(private readonly httpService: HttpService) {}

  async getTransactions(params: {
    contract?: string;
    eventType?: string;
    address?: string;
    fromBlock?: number;
    toBlock?: number;
    limit?: number;
    offset?: number;
  }) {
    try {
      // Using Flow API v1 endpoint
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/flow/v1/transaction`, {
          headers: this.apiKey ? { 'X-API-Key': this.apiKey } : {},
          params,
        })
      );
      return response.data?.data || [];
    } catch (error) {
      this.logger.error('Failed to get transactions:', error);
      return [];
    }
  }

  async getTransaction(txId: string) {
    try {
      // Using Flow API v1 endpoint
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/flow/v1/transaction/${txId}`, {
          headers: this.apiKey ? { 'X-API-Key': this.apiKey } : {},
        })
      );
      return response.data?.data || null;
    } catch (error) {
      this.logger.error(`Failed to get transaction ${txId}:`, error);
      return null;
    }
  }

  async getEvents(params: {
    eventType: string;
    contract?: string;
    fromBlock?: number;
    toBlock?: number;
    limit?: number;
  }) {
    try {
      // Using Simple API v1 endpoint for events
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/simple/v1/events`, {
          headers: this.apiKey ? { 'X-API-Key': this.apiKey } : {},
          params: {
            event_type: params.eventType,
            start_height: params.fromBlock,
            end_height: params.toBlock,
            limit: params.limit || 100,
          },
        })
      );
      return response.data || [];
    } catch (error) {
      this.logger.error('Failed to get events:', error);
      return [];
    }
  }

  async getTransactionEvents(txId: string) {
    try {
      // Using Simple API v1 endpoint for transaction events
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/simple/v1/transaction/events`, {
          headers: this.apiKey ? { 'X-API-Key': this.apiKey } : {},
          params: { tx_hash: txId },
        })
      );
      return response.data || [];
    } catch (error) {
      this.logger.error(`Failed to get transaction events:`, error);
      return [];
    }
  }

  async getBlock(blockHeight: number) {
    try {
      // Using Flow API v1 endpoint for blocks
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/flow/v1/block/${blockHeight}`, {
          headers: this.apiKey ? { 'X-API-Key': this.apiKey } : {},
        })
      );
      return response.data?.data || null;
    } catch (error) {
      this.logger.error(`Failed to get block ${blockHeight}:`, error);
      return null;
    }
  }

  async getAccountTransactions(address: string, limit = 50) {
    try {
      // Using Flow API v1 endpoint for account transactions
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/flow/v1/account/${address}/transaction`, {
          headers: this.apiKey ? { 'X-API-Key': this.apiKey } : {},
          params: { limit },
        })
      );
      return response.data?.data || [];
    } catch (error) {
      this.logger.error(`Failed to get account transactions:`, error);
      return [];
    }
  }

  async search(query: string) {
    try {
      // Using Public API v1 resolver (Omnisearch)
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/public/v1/resolver`, {
          headers: this.apiKey ? { 'X-API-Key': this.apiKey } : {},
          params: { id: query },
        })
      );
      return response.data?.data || null;
    } catch (error) {
      this.logger.error('Failed to search:', error);
      return null;
    }
  }
}
