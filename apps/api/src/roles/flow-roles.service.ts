import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { RoleType } from "@prisma/client";
import * as fcl from "@onflow/fcl";

import { normalizeFlowAddress } from "../common/flow-address.util";
import { resolveBackendFlowConfig } from "../common/flow-config.util";

type RoleEventType = "grant" | "revoke";
type FlowTransactionResult = Awaited<
  ReturnType<ReturnType<typeof fcl.tx>["onceSealed"]>
>;

export interface RoleEventPayload {
  type: RoleEventType;
  address: string;
  role: RoleType;
  transactionId: string;
}

@Injectable()
export class FlowRolesService {
  private static configured = false;

  private readonly logger = new Logger(FlowRolesService.name);
  private readonly retryAttempts = this.parsePositiveInteger(
    process.env.FLOW_TX_RETRY_ATTEMPTS,
    3
  );
  private readonly retryDelayMs = this.parseNonNegativeInteger(
    process.env.FLOW_TX_RETRY_DELAY_MS,
    1500
  );
  private readonly txTimeoutMs = this.parseNonNegativeInteger(
    process.env.FLOW_TX_TIMEOUT_MS,
    20000
  );

  constructor() {
    if (!FlowRolesService.configured) {
      const { accessNode, network, contracts } = resolveBackendFlowConfig();

      fcl
        .config()
        .put("accessNode.api", accessNode)
        .put("flow.network", network)
        .put("0xCoreMarketHub", contracts.coreMarketHub)
        .put("0xLMSRAmm", contracts.lmsrAmm)
        .put("0xOutcomeToken", contracts.outcomeToken);

      Logger.log(
        `Configured Flow FCL access node ${accessNode} for network ${network}`,
        FlowRolesService.name
      );

      FlowRolesService.configured = true;
    }
  }

  async fetchRoleEvents(transactionId: string): Promise<RoleEventPayload[]> {
    if (typeof transactionId !== "string" || transactionId.trim().length === 0) {
      throw new BadRequestException("transactionId is required");
    }

    const txId = transactionId.trim();
    const result = await this.waitForSealed(txId);

    if (result.status !== 4) {
      this.logger.warn(`Transaction ${txId} not sealed yet (status ${result.status})`);
      throw new BadRequestException("transaction not sealed");
    }

    if (result.statusCode !== 0) {
      const message = result.errorMessage ?? "transaction failed";
      this.logger.error(`Transaction ${txId} failed: ${message}`);
      throw new BadRequestException(message);
    }

    const events: RoleEventPayload[] = [];

    for (const event of result.events ?? []) {
      const type = this.parseEventType(event.type ?? "");
      if (!type) {
        continue;
      }

      const data = this.parseEventData(event.data);
      const role = this.parseRole(data.role);
      const address = normalizeFlowAddress(data.address);

      events.push({
        type,
        address,
        role,
        transactionId: txId,
      });

      this.logger.log(
        `Flow role ${type} event for ${address} (${role}) in tx ${txId}`
      );
    }

    if (events.length === 0) {
      this.logger.warn(`Transaction ${txId} does not contain role events`);
      throw new BadRequestException("transaction does not contain role events");
    }

    return events;
  }

  private async waitForSealed(txId: string): Promise<FlowTransactionResult> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt += 1) {
      try {
        const result = await this.withTimeout(fcl.tx(txId).onceSealed(), this.txTimeoutMs);
        if (!result) {
          throw new Error("empty transaction response");
        }
        return result;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Attempt ${attempt}/${this.retryAttempts} to fetch tx ${txId} failed: ${message}`
        );

        if (attempt === this.retryAttempts) {
          break;
        }

        if (this.retryDelayMs > 0) {
          await this.delay(this.retryDelayMs);
        }
      }
    }

    const errorMessage =
      lastError instanceof Error ? lastError.message : "failed to fetch transaction";
    throw new BadRequestException(errorMessage);
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return promise;
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Flow transaction wait timed out"));
      }, timeoutMs);

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private async delay(durationMs: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, durationMs));
  }

  private parsePositiveInteger(source: string | undefined, fallback: number): number {
    if (!source) {
      return fallback;
    }
    const value = Number.parseInt(source, 10);
    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }
    return value;
  }

  private parseNonNegativeInteger(source: string | undefined, fallback: number): number {
    if (!source) {
      return fallback;
    }
    const value = Number.parseInt(source, 10);
    if (!Number.isFinite(value) || value < 0) {
      return fallback;
    }
    return value;
  }

  private parseEventType(raw: string): RoleEventType | null {
    if (!raw) {
      return null;
    }

    if (raw.endsWith(".CoreMarketHub.RoleGranted")) {
      return "grant";
    }

    if (raw.endsWith(".CoreMarketHub.RoleRevoked")) {
      return "revoke";
    }

    return null;
  }

  private parseEventData(payload: unknown): { address: string; role: string } {
    const candidate = this.normalizePayload(payload);
    if (candidate && typeof candidate === "object" && "address" in candidate && "role" in candidate) {
      const { address, role } = candidate as { address?: unknown; role?: unknown };
      if (typeof address === "string" && typeof role === "string") {
        return { address, role };
      }
    }

    throw new BadRequestException("unexpected role event payload");
  }

  private normalizePayload(payload: unknown): unknown {
    if (payload && typeof payload === "object") {
      return payload;
    }

    if (typeof payload === "string" && payload.trim().length > 0) {
      try {
        const decoded = JSON.parse(payload);
        if (decoded && typeof decoded === "object" && "value" in decoded) {
          const value = (decoded as { value?: unknown }).value;
          if (value && typeof value === "object" && "fields" in value) {
            const fields = (value as { fields?: Array<{ name: string; value: { value: unknown } }> }).fields;
            if (Array.isArray(fields)) {
              const record: Record<string, unknown> = {};
              for (const field of fields) {
                const key = field.name;
                const val = field.value?.value;
                record[key] = val;
              }
              return record;
            }
          }
        }
        return decoded;
      } catch {
        return null;
      }
    }

    return null;
  }

  private parseRole(value: string): RoleType {
    const normalized = value.trim().toUpperCase();
    if (
      normalized === "ADMIN" ||
      normalized === "OPERATOR" ||
      normalized === "ORACLE" ||
      normalized === "PATROL"
    ) {
      return normalized as RoleType;
    }
    throw new BadRequestException("unsupported role type in event");
  }
}
