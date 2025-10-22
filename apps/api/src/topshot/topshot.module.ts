import { Module } from "@nestjs/common";

import { TopShotService } from "./topshot.service";
import { TopShotLockService } from "./topshot-lock.service";
import { TopShotRewardService } from "./topshot-reward.service";
import { TopShotGraphQLClient } from "./topshot-graphql.client";
import { TopShotUsernameService } from "./topshot-username.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PointsModule } from "../points/points.module";
import { OraclesModule } from "../oracles/oracles.module";

@Module({
  imports: [PrismaModule, PointsModule, OraclesModule],
  providers: [TopShotService, TopShotLockService, TopShotRewardService, TopShotGraphQLClient, TopShotUsernameService],
  exports: [TopShotService, TopShotLockService, TopShotRewardService, TopShotGraphQLClient, TopShotUsernameService],
})
export class TopShotModule {}
