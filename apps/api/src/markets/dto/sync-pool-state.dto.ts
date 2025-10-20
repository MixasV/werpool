export interface SyncPoolStateRequestDto {
  bVector: number[];
  totalLiquidity: number;
  outcomeSupply: number[];
  signer?: string;
  network?: string;
}

export interface SyncPoolStateResponseDto {
  bVector: string[];
  totalLiquidity: string;
  outcomeSupply: string[];
  transactionPath: string;
  cadenceArguments: { type: string; value: unknown }[];
  transactionId: string;
  signer: string;
  network: string;
}
