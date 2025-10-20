export interface BurnOutcomeRequestDto {
  amount: number;
  signer?: string;
  network?: string;
}

export interface BurnOutcomeResponseDto {
  amount: string;
  transactionPath: string;
  cadenceArguments: { type: string; value: unknown }[];
  transactionId: string;
  signer: string;
  network: string;
}
