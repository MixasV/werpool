import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

import type { MarketPoolStateDto } from "./dto/market-pool-state.dto";

interface SubscribePayload {
  slug?: string;
  marketId?: string;
}

interface PoolStateUpdatePayload {
  marketId: string;
  slug: string;
  state: MarketPoolStateDto;
  timestamp: string;
}

interface TransactionLogEventPayload {
  id: string;
  marketId: string;
  slug: string;
  type: string;
  status: string;
  transactionId: string;
  signer: string;
  network: string;
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

interface TradeEventPayload {
  id: string;
  marketId: string;
  slug: string;
  outcomeId: string | null;
  outcomeLabel: string;
  outcomeIndex: number;
  shares: string;
  flowAmount: string;
  isBuy: boolean;
  probabilities: number[];
  maxFlowAmount?: string | null;
  transactionId: string;
  signer: string;
  network: string;
  createdAt: string;
}

interface AnalyticsEventPayload {
  id: string;
  marketId: string;
  slug: string;
  outcomeId: string | null;
  outcomeIndex: number;
  outcomeLabel: string;
  interval: string;
  bucketStart: string;
  bucketEnd: string;
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  averagePrice: number;
  volumeShares: number;
  volumeFlow: number;
  netFlow: number;
  tradeCount: number;
  updatedAt: string;
}

@WebSocketGateway({
  namespace: "markets",
  cors: { origin: true, credentials: true },
  transports: ["websocket", "polling"],
})
export class MarketUpdatesGateway
  implements OnGatewayConnection<Socket>, OnGatewayDisconnect<Socket>
{
  private readonly logger = new Logger(MarketUpdatesGateway.name);

  @WebSocketServer()
  private server: Server | undefined;

  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage("market.subscribe")
  handleSubscribe(
    @MessageBody() payload: SubscribePayload,
    @ConnectedSocket() client: Socket
  ): { ok: boolean; room?: string } {
    const room = this.ensureRoom(payload);
    client.join(room);
    this.logger.debug(`Client ${client.id} subscribed to ${room}`);
    return { ok: true, room };
  }

  @SubscribeMessage("market.unsubscribe")
  handleUnsubscribe(
    @MessageBody() payload: SubscribePayload,
    @ConnectedSocket() client: Socket
  ): { ok: boolean; room?: string } {
    const room = this.ensureRoom(payload);
    client.leave(room);
    this.logger.debug(`Client ${client.id} unsubscribed from ${room}`);
    return { ok: true, room };
  }

  emitPoolStateUpdate(payload: PoolStateUpdatePayload): void {
    if (!this.server) {
      this.logger.warn("Attempted to emit pool update without initialized server");
      return;
    }

    const room = this.toRoom(payload.slug, payload.marketId);
    this.server.to(room).emit("market.pool-state", payload);
    this.server.emit("market.pool-state", payload);
  }

  emitTransactionLog(payload: TransactionLogEventPayload): void {
    if (!this.server) {
      this.logger.warn("Attempted to emit transaction log without initialized server");
      return;
    }

    const room = this.toRoom(payload.slug, payload.marketId);
    this.server.to(room).emit("market.transaction", payload);
    this.server.emit("market.transaction", payload);
  }

  emitTrade(payload: TradeEventPayload): void {
    if (!this.server) {
      this.logger.warn("Attempted to emit trade update without initialized server");
      return;
    }

    const room = this.toRoom(payload.slug, payload.marketId);
    this.server.to(room).emit("market.trade", payload);
    this.server.emit("market.trade", payload);
  }

  emitAnalyticsSnapshot(payload: AnalyticsEventPayload): void {
    if (!this.server) {
      this.logger.warn("Attempted to emit analytics update without initialized server");
      return;
    }

    const room = this.toRoom(payload.slug, payload.marketId);
    this.server.to(room).emit("market.analytics", payload);
    this.server.emit("market.analytics", payload);
  }

  private ensureRoom(payload: SubscribePayload): string {
    const { slug, marketId } = payload;

    if (typeof slug === "string" && slug.trim().length > 0) {
      return this.toRoom(slug.trim(), marketId);
    }

    if (typeof marketId === "string" && marketId.trim().length > 0) {
      return this.toRoom(marketId.trim(), marketId.trim());
    }

    throw new Error("market.subscribe payload must include slug or marketId");
  }

  private toRoom(slugOrId: string, marketId?: string): string {
    const normalized = slugOrId.trim();
    const resolved = normalized.length > 0 ? normalized : marketId ?? "unknown";
    return `market:${resolved}`;
  }
}
