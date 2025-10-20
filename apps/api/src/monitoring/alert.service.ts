import { Injectable, Logger } from "@nestjs/common";

interface AlertPayload {
  event: string;
  detail?: Record<string, unknown>;
  error?: string;
}

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  async notify(payload: AlertPayload): Promise<void> {
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (!webhookUrl) {
      this.logger.debug(`Webhook is not configured, skipping alert for ${payload.event}`);
      return;
    }

    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV ?? "development",
          service: "markets-api",
        }),
      });
    } catch (error) {
      this.logger.error(`Не удалось отправить алерт ${payload.event}`, error as Error);
    }
  }
}
