import { INestApplication, Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    const shutdown = async () => {
      await app.close();
    };

    process.once("beforeExit", shutdown);
    ["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) => {
      process.once(signal, async () => {
        await shutdown();
        process.kill(process.pid, signal as NodeJS.Signals);
      });
    });
  }
}
