import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";

import { FlowCliService } from "../../flow/flow-cli.service";
import { CadenceValue } from "./cadence.types";
import { LmsrState } from "../lmsr/lmsr.types";

interface AccountBalances {
  flowBalance: number;
  outcomeBalance: number;
}

const poolStateScriptPath = "contracts/cadence/scripts/getPoolState.cdc";
const marketIdScriptPath = "contracts/cadence/scripts/getMarketIdBySlug.cdc";
const marketStorageScriptPath = "contracts/cadence/scripts/getMarketStorage.cdc";
const accountBalancesScriptPath = "contracts/cadence/scripts/getAccountBalances.cdc";

@Injectable()
export class FlowMarketService {
  constructor(private readonly flowCli: FlowCliService) {}

  async getPoolState(marketId: number): Promise<LmsrState> {
    let response: unknown;
    try {
      response = await this.flowCli.executeJson<unknown>([
        "scripts",
        "execute",
        poolStateScriptPath,
        marketId.toString(),
      ]);
    } catch (error) {
      throw new ServiceUnavailableException((error as Error).message);
    }

    const decoded = this.decodeCadence(response);
    if (!decoded) {
      throw new NotFoundException(`Pool state for market ${marketId} not found`);
    }

    return this.mapState(decoded);
  }

  async getMarketIdBySlug(slug: string): Promise<number | null> {
    let response: unknown;
    try {
      response = await this.flowCli.executeJson<unknown>([
        "scripts",
        "execute",
        marketIdScriptPath,
        slug,
      ]);
    } catch (error) {
      throw new ServiceUnavailableException((error as Error).message);
    }

    const cadenceValue = this.extractCadenceValue(response);
    const decoded = this.toJs(cadenceValue);
    if (decoded === null) {
      return null;
    }

    if (typeof decoded !== "number" || Number.isNaN(decoded)) {
      throw new Error("Invalid market id payload");
    }

    return decoded;
  }

  async getAccountBalances(address: string, marketId: number): Promise<AccountBalances> {
    let response: unknown;
    try {
      response = await this.flowCli.executeJson<unknown>([
        "scripts",
        "execute",
        accountBalancesScriptPath,
        address,
        marketId.toString(),
      ]);
    } catch (error) {
      throw new ServiceUnavailableException((error as Error).message);
    }

    const decoded = this.decodeCadence(response);
    if (!decoded) {
      throw new NotFoundException(
        `Account balances for ${address} in market ${marketId} not found`
      );
    }

    return this.mapAccountBalances(decoded);
  }

  private decodeCadence(payload: unknown): Record<string, unknown> | null {
    const cadenceValue = this.extractCadenceValue(payload);
    if (!cadenceValue) {
      return null;
    }
    const decoded = this.toJs(cadenceValue);
    if (!decoded || typeof decoded !== "object") {
      return null;
    }
    return decoded as Record<string, unknown>;
  }

  private extractCadenceValue(payload: unknown): CadenceValue | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    if (this.isCadenceValue(payload)) {
      return payload;
    }

    if ("value" in payload) {
      return this.extractCadenceValue((payload as { value: unknown }).value);
    }

    return null;
  }

  private toJs(value: CadenceValue | null): unknown {
    if (!value) {
      return null;
    }

    switch (value.type) {
      case "Optional":
      case "OptionalValue":
        return this.toJs(value.value ?? null);
      case "Dictionary":
        return value.value.reduce<Record<string, unknown>>((acc, entry) => {
          const key = this.toJs(entry.key);
          if (typeof key !== "string") {
            throw new Error("Cadence dictionary key must be string");
          }
          acc[key] = this.toJs(entry.value);
          return acc;
        }, {});
      case "Array":
        return value.value.map((item) => this.toJs(item));
      case "String":
        return value.value;
      case "UInt":
      case "UInt64":
      case "Int":
      case "Int64":
      case "UFix64":
      case "Fix64":
        return Number(value.value);
      case "Address":
        return value.value;
      default: {
        const typeName = (value as { type?: string }).type ?? "unknown";
        throw new Error(`Unsupported Cadence type: ${typeName}`);
      }
    }
  }

  private isCadenceValue(value: unknown): value is CadenceValue {
    if (!value || typeof value !== "object") {
      return false;
    }
    return Object.prototype.hasOwnProperty.call(value, "type");
  }

  private mapState(payload: unknown): LmsrState {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid pool state payload");
    }

    const data = payload as Record<string, unknown>;
    const liquidityParameter = this.requireNumber(data.liquidityParameter, "liquidityParameter");
    const totalLiquidity = this.requireNumber(data.totalLiquidity, "totalLiquidity");
    const bVector = this.requireNumberArray(data.bVector, "bVector");
    const outcomeSupply = this.requireNumberArray(data.outcomeSupply, "outcomeSupply");

    return {
      liquidityParameter,
      totalLiquidity,
      bVector,
      outcomeSupply,
    };
  }

  private mapAccountBalances(payload: Record<string, unknown>): AccountBalances {
    const flowBalance = this.requireNumber(payload.flowBalance, "flowBalance");
    const outcomeBalance = this.requireNumber(payload.outcomeBalance, "outcomeBalance");

    return {
      flowBalance,
      outcomeBalance,
    };
  }

  async getMarketStorage(marketId: number): Promise<Record<string, string>> {
    let response: unknown;
    try {
      response = await this.flowCli.executeJson<unknown>([
        "scripts",
        "execute",
        marketStorageScriptPath,
        marketId.toString(),
      ]);
    } catch (error) {
      throw new ServiceUnavailableException((error as Error).message);
    }

    const decoded = this.decodeCadence(response);
    if (!decoded) {
      throw new NotFoundException(`Market storage metadata for ${marketId} not found`);
    }

    return this.mapStorageMetadata(decoded);
  }

  private mapStorageMetadata(payload: Record<string, unknown>): Record<string, string> {
    const fields = [
      "liquidityPoolPath",
      "outcomeVaultPath",
      "liquidityReceiverPath",
      "liquidityProviderPath",
      "outcomeReceiverPath",
      "outcomeBalancePath",
      "outcomeProviderPath",
      "owner",
    ] as const;

    return fields.reduce<Record<string, string>>((acc, field) => {
      const value = payload[field];
      if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Field ${field} is not a string`);
      }
      acc[field] = value;
      return acc;
    }, {});
  }

  private requireNumber(value: unknown, field: string): number {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error(`Field ${field} is not a number`);
    }
    return value;
  }

  private requireNumberArray(value: unknown, field: string): number[] {
    if (!Array.isArray(value)) {
      throw new Error(`Field ${field} is not an array`);
    }
    return value.map((entry, index) => {
      if (typeof entry !== "number" || Number.isNaN(entry)) {
        throw new Error(`Field ${field}[${index}] is not a number`);
      }
      return entry;
    });
  }
}
