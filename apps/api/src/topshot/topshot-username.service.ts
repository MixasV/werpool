import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TopShotGraphQLClient } from './topshot-graphql.client';

@Injectable()
export class TopShotUsernameService {
  private readonly logger = new Logger(TopShotUsernameService.name);

  constructor(private readonly topShotGraphQL: TopShotGraphQLClient) {}

  async resolveUsername(username: string): Promise<string> {
    try {
      this.logger.log(`Resolving TopShot username: ${username}`);

      // Query TopShot GraphQL API for user by username
      const query = `
        query GetUserByUsername($username: String!) {
          getUserByUsername(username: $username) {
            flowAddress
            dapperID
            username
          }
        }
      `;

      const result = await this.executeTopShotQuery<{
        data: {
          getUserByUsername: {
            flowAddress: string;
            dapperID: string;
            username: string;
          } | null;
        };
      }>(query, { username });

      if (!result?.data?.getUserByUsername) {
        throw new NotFoundException(`TopShot user '${username}' not found`);
      }

      return result.data.getUserByUsername.flowAddress;
    } catch (error) {
      this.logger.error(`Failed to resolve username ${username}:`, error);
      throw new NotFoundException(`TopShot user '${username}' not found`);
    }
  }

  async verifyUserIdentity(connectedAddress: string, claimedUsername: string): Promise<boolean> {
    try {
      const resolvedAddress = await this.resolveUsername(claimedUsername);
      return resolvedAddress.toLowerCase() === connectedAddress.toLowerCase();
    } catch {
      return false;
    }
  }

  async getUsername(address: string): Promise<string | null> {
    try {
      this.logger.log(`Getting username for address: ${address}`);

      // Reverse lookup: address → username via TopShot GraphQL
      const query = `
        query GetUserByFlowAddress($address: String!) {
          getUserByFlowAddress(address: $address) {
            username
            dapperID
            flowAddress
          }
        }
      `;

      const result = await this.executeTopShotQuery<{
        data: {
          getUserByFlowAddress: {
            username: string;
            dapperID: string;
            flowAddress: string;
          } | null;
        };
      }>(query, { address: this.normalizeAddress(address) });

      return result?.data?.getUserByFlowAddress?.username || null;
    } catch (error) {
      this.logger.error('Failed to get username:', error);
      return null;
    }
  }

  async getUserProfile(address: string) {
    try {
      const query = `
        query GetUserProfile($address: String!) {
          getUserByFlowAddress(address: $address) {
            username
            dapperID
            publicProfile {
              username
              avatarUrl
              bio
            }
          }
        }
      `;

      const result = await this.executeTopShotQuery<{
        data: {
          getUserByFlowAddress: {
            username: string;
            publicProfile?: {
              username: string;
              avatarUrl?: string;
              bio?: string;
            };
          } | null;
        };
      }>(query, { address: this.normalizeAddress(address) });

      if (!result?.data?.getUserByFlowAddress) {
        return null;
      }

      return {
        username: result.data.getUserByFlowAddress.username,
        avatarUrl: result.data.getUserByFlowAddress.publicProfile?.avatarUrl || null,
      };
    } catch (error) {
      this.logger.error('Failed to get user profile:', error);
      return null;
    }
  }

  private async executeTopShotQuery<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const endpoint = 'https://public-api.nbatopshot.com/graphql';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Werpool-PredictionMarkets/1.0',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  private normalizeAddress(address: string): string {
    const trimmed = address.trim();
    return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  }
}
