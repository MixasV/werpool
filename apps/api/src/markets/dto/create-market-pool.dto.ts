export interface CreateMarketPoolRequestDto {
  outcomeCount: number;
  liquidityParameter: number;
  seedAmount: number;
  signer?: string;
  network?: string;
}

export interface CreateMarketPoolResponseDto {
  outcomeCount: number;
  liquidityParameter: string;
  seedAmount: string;
  transactionPath: string;
  cadenceArguments: { type: string; value: unknown }[];
  transactionId: string;
  signer: string;
  network: string;
}
