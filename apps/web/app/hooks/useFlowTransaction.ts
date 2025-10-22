import { useState, useCallback } from 'react';
import * as fcl from '@onflow/fcl';

export type TransactionStatus = 'idle' | 'signing' | 'pending' | 'finalized' | 'executed' | 'sealed' | 'error';

export interface TransactionState {
  status: TransactionStatus;
  txId: string | null;
  errorMessage: string | null;
  events: any[];
}

interface UseFlowTransactionResult {
  state: TransactionState;
  executeMutation: (cadence: string, args: (arg: any, t: any) => any[], options?: { limit?: number }) => Promise<string | null>;
  reset: () => void;
}

/**
 * Hook for executing Flow transactions with user signature
 * Tracks transaction status from signing to sealed
 */
export const useFlowTransaction = (): UseFlowTransactionResult => {
  const [state, setState] = useState<TransactionState>({
    status: 'idle',
    txId: null,
    errorMessage: null,
    events: [],
  });

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      txId: null,
      errorMessage: null,
      events: [],
    });
  }, []);

  const executeMutation = useCallback(async (
    cadence: string,
    args: (arg: any, t: any) => any[],
    options?: { limit?: number }
  ): Promise<string | null> => {
    try {
      setState({
        status: 'signing',
        txId: null,
        errorMessage: null,
        events: [],
      });

      // Execute transaction via FCL
      const txId = await fcl.mutate({
        cadence,
        args,
        limit: options?.limit ?? 9999,
      });

      setState((prev) => ({
        ...prev,
        status: 'pending',
        txId,
      }));

      // Subscribe to transaction status updates
      const unsub = fcl.tx(txId).subscribe((txStatus: any) => {
        if (fcl.tx.isPending(txStatus)) {
          setState((prev) => ({ ...prev, status: 'pending' }));
        } else if (fcl.tx.isFinalized(txStatus)) {
          setState((prev) => ({ ...prev, status: 'finalized' }));
        } else if (fcl.tx.isExecuted(txStatus)) {
          setState((prev) => ({ ...prev, status: 'executed' }));
        } else if (fcl.tx.isSealed(txStatus)) {
          setState((prev) => ({
            ...prev,
            status: 'sealed',
            events: txStatus.events || [],
          }));
          unsub();
        } else if (txStatus.errorMessage) {
          setState((prev) => ({
            ...prev,
            status: 'error',
            errorMessage: txStatus.errorMessage,
          }));
          unsub();
        }
      });

      return txId;
    } catch (error: any) {
      const errorMessage = error?.message || 'Transaction failed';
      setState({
        status: 'error',
        txId: null,
        errorMessage,
        events: [],
      });
      return null;
    }
  }, []);

  return {
    state,
    executeMutation,
    reset,
  };
};
