import { Module } from "@nestjs/common";

import { MockAiSportsProvider } from "./mock-provider";
import { AiSportsProviderFactory } from "./transaction-provider.factory";

@Module({
  providers: [
    {
      provide: 'AISPORTS_TX_PROVIDER',
      useFactory: () => AiSportsProviderFactory.getSingleton(),
    },
    MockAiSportsProvider,
  ],
  exports: ['AISPORTS_TX_PROVIDER', MockAiSportsProvider],
})
export class AiSportsTransactionModule {}
