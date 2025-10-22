import { useState, useCallback } from 'react';
import * as fcl from '@onflow/fcl';
import { useFlowWallet } from '../providers/flow-wallet-provider';
import { useFlowTransaction } from './useFlowTransaction';
import { EXECUTE_TRADE_TRANSACTION } from '../lib/flow-transactions';
import type { QuoteTradeResult } from '../lib/markets-api';

interface UseUserSignedTradeOptions {
  marketId: number;
  onSuccess?: (txId: string) => void;
  onError?: (error: Error) => void;
}

export interface TradeParams {
  outcomeIndex: number;
  shares: number;
  isBuy: boolean;
  quote: QuoteTradeResult;
}

/**
 * Hook for executing trades with user wallet signature
 * Uses FCL mutate() to sign transactions directly in user's wallet
 */
export const useUserSignedTrade = ({ marketId, onSuccess, onError }: UseUserSignedTradeOptions) => {
  const { loggedIn, addr, authMode } = useFlowWallet();
  const { state, executeMutation, reset } = useFlowTransaction();
  const [isPreparingTx, setIsPreparingTx] = useState(false);

  const canUseUserSigning = authMode === 'wallet' && loggedIn && addr;

  const executeTrade = useCallback(async (params: TradeParams) => {
    if (!canUseUserSigning) {
      throw new Error('User wallet not connected. Please connect your wallet first.');
    }

    setIsPreparingTx(true);

    try {
      // Prepare transaction arguments from quote
      const {
        outcomeIndex,
        shares,
        isBuy,
        quote,
      } = params;

      const flowAmount = parseFloat(quote.flowAmount);
      const outcomeAmount = shares;

      // Convert quote data for transaction
      const newBVector = quote.newBVector.map((value) => parseFloat(value).toFixed(8));
      const newTotalLiquidity = parseFloat(quote.newTotalLiquidity).toFixed(8);
      const newOutcomeSupply = quote.newOutcomeSupply.map((value) => parseFloat(value).toFixed(8));

      setIsPreparingTx(false);

      // Execute transaction with FCL
      const txId = await executeMutation(
        EXECUTE_TRADE_TRANSACTION,
        (arg, t) => [
          arg(marketId.toString(), t.UInt64),
          arg(outcomeIndex.toString(), t.Int),
          arg(flowAmount.toFixed(8), t.UFix64),
          arg(outcomeAmount.toFixed(8), t.UFix64),
          arg(newBVector, t.Array(t.UFix64)),
          arg(newTotalLiquidity, t.UFix64),
          arg(newOutcomeSupply, t.Array(t.UFix64)),
          arg(isBuy, t.Bool),
        ],
        { limit: 9999 }
      );

      if (txId && onSuccess) {
        onSuccess(txId);
      }

      return txId;
    } catch (error: any) {
      setIsPreparingTx(false);
      const errorObj = error instanceof Error ? error : new Error(String(error));
      
      if (onError) {
        onError(errorObj);
      }
      
      throw errorObj;
    }
  }, [canUseUserSigning, marketId, executeMutation, onSuccess, onError]);

  return {
    executeTrade,
    transactionState: state,
    isPreparingTx,
    canUseUserSigning,
    reset,
  };
};
