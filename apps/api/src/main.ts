import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { PrismaService } from "./prisma/prisma.service";

loadEnv({ path: resolve(__dirname, "../../../.env"), override: false });
loadEnv({ path: resolve(__dirname, "../../.env"), override: false });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);
  const parsedPort = Number(process.env.PORT);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3333;
  await app.listen(port);
}

bootstrap();
