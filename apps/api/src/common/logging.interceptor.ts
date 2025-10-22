import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { randomUUID } from "node:crypto";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, url, ip } = request;
    
    const requestId = randomUUID();
    request.requestId = requestId;
    response.setHeader("X-Request-ID", requestId);

    const startTime = Date.now();

    this.logger.log({
      type: "request",
      requestId,
      method,
      url,
      ip,
      userAgent: request.get("user-agent"),
      timestamp: new Date().toISOString(),
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logger.log({
            type: "response",
            requestId,
            method,
            url,
            statusCode: response.statusCode,
            duration,
            timestamp: new Date().toISOString(),
          });
        },
        error: (error: Error) => {
          const duration = Date.now() - startTime;
          this.logger.error({
            type: "response",
            requestId,
            method,
            url,
            statusCode: response.statusCode || 500,
            duration,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
          });
        },
      })
    );
  }
}
