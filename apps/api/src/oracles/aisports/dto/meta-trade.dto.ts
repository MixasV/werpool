export interface MetaTradeRequestDto {
  outcome: "YES" | "NO";
  shares: number;
}

export interface MetaTradeExecuteRequestDto extends MetaTradeRequestDto {}
