export interface MintOutcomeRequestDto {
  amount: number;
  signer?: string;
  network?: string;
}

export interface MintOutcomeResponseDto {
  amount: string;
  transactionPath: string;
  cadenceArguments: { type: string; value: unknown }[];
  transactionId: string;
  signer: string;
  network: string;
}
