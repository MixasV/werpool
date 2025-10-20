import { Global, Module } from "@nestjs/common";

import { FlowCliService } from "./flow-cli.service";
import { AiSportsFlowService } from "./aisports-flow.service";

@Global()
@Module({
  providers: [FlowCliService, AiSportsFlowService],
  exports: [FlowCliService, AiSportsFlowService],
})
export class FlowModule {}
