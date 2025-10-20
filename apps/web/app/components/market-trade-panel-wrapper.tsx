'use client';

import { useState, useCallback } from 'react';
import { MarketTradePanel } from './market-trade-panel';
import { TransactionConfirmationModal } from './transaction-confirmation-modal';
import { useFlowWallet } from '../providers/flow-wallet-provider';
import { useUserSignedTrade } from '../hooks/useUserSignedTrade';
import type {
  MarketDetail,
  MarketPoolState,
  ExecuteTradePayload,
  ExecuteTradeResult,
  QuoteTradePayload,
  QuoteTradeResult,
  MarketAccountBalances,
  MarketTrade,
} from '../lib/markets-api';

interface MarketTradePanelWrapperProps {
  market: MarketDetail;
  outcomes: MarketDetail['outcomes'];
  onQuote: (payload: QuoteTradePayload) => Promise<QuoteTradeResult>;
  onExecute: (payload: ExecuteTradePayload) => Promise<ExecuteTradeResult>;
  fetchBalances: (address: string) => Promise<MarketAccountBalances>;
  initialPoolState: MarketPoolState | null;
  refreshPool: () => Promise<MarketPoolState>;
  marketSlug: string;
  marketId: string;
  initialTrades: MarketTrade[];
  tradesLimit?: number;
}

/**
 * Wrapper component that adds user-signed transaction support to MarketTradePanel
 * Falls back to backend-signed transactions for custodial users
 */
export function MarketTradePanelWrapper({
  market,
  outcomes,
  onQuote,
  onExecute,
  fetchBalances,
  initialPoolState,
  refreshPool,
  marketSlug,
  marketId,
  initialTrades,
  tradesLimit,
}: MarketTradePanelWrapperProps) {
  const { loggedIn, authMode, network } = useFlowWallet();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [transactionDetails, setTransactionDetails] = useState<any>(null);

  const {
    executeTrade: executeUserSignedTrade,
    transactionState,
    isPreparingTx,
    canUseUserSigning,
    reset: resetTransaction,
  } = useUserSignedTrade({
    marketId: parseInt(marketId),
    onSuccess: (txId) => {
      console.log('Transaction successful:', txId);
      // Refresh pool state after successful transaction
      refreshPool().catch(console.error);
    },
    onError: (error) => {
      console.error('Transaction failed:', error);
    },
  });

  // Enhanced execute handler that chooses between user-signed and backend-signed
  const handleExecuteTrade = useCallback(
    async (payload: ExecuteTradePayload): Promise<ExecuteTradeResult> => {
      // If user can sign transactions with their wallet, use FCL
      if (canUseUserSigning && loggedIn && authMode === 'wallet') {
        try {
          // First get a quote
          const quote = await onQuote({
            outcomeIndex: payload.outcomeIndex,
            shares: payload.shares,
            isBuy: payload.isBuy,
          });

          // Prepare transaction details for modal
          const outcome = outcomes.find((o) => o.index === payload.outcomeIndex);
          setTransactionDetails({
            type: payload.isBuy ? 'Buy Shares' : 'Sell Shares',
            marketTitle: market.title,
            outcome: outcome?.label || `Outcome ${payload.outcomeIndex}`,
            amount: `${payload.shares} shares for ${quote.flowAmount} FLOW`,
          });

          // Open modal and execute user-signed transaction
          setIsModalOpen(true);
          resetTransaction();

          const txId = await executeUserSignedTrade({
            outcomeIndex: payload.outcomeIndex,
            shares: payload.shares,
            isBuy: payload.isBuy,
            quote,
          });

          if (!txId) {
            throw new Error('Transaction failed');
          }

          // Wait for transaction to be sealed
          // In real implementation, you'd poll the transaction status
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Return a result compatible with backend response
          return {
            success: true,
            txId,
            flowAmount: quote.flowAmount,
            shares: payload.shares.toString(),
            outcomeIndex: payload.outcomeIndex,
            isBuy: payload.isBuy,
          };
        } catch (error: any) {
          console.error('User-signed transaction failed, falling back to backend:', error);
          // If user rejected or error, fall back to backend
          if (error.message?.includes('User rejected') || error.message?.includes('declined')) {
            setIsModalOpen(false);
            throw error;
          }
        }
      }

      // Fall back to backend-signed transaction for custodial users
      return onExecute(payload);
    },
    [
      canUseUserSigning,
      loggedIn,
      authMode,
      onQuote,
      onExecute,
      outcomes,
      market.title,
      executeUserSignedTrade,
      resetTransaction,
    ]
  );

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setTransactionDetails(null);
    resetTransaction();
  }, [resetTransaction]);

  return (
    <>
      <MarketTradePanel
        outcomes={outcomes}
        onQuote={onQuote}
        onExecute={handleExecuteTrade}
        fetchBalances={fetchBalances}
        initialPoolState={initialPoolState}
        refreshPool={refreshPool}
        marketSlug={marketSlug}
        marketId={marketId}
        initialTrades={initialTrades}
        tradesLimit={tradesLimit}
      />

      {canUseUserSigning && (
        <TransactionConfirmationModal
          isOpen={isModalOpen}
          status={transactionState.status}
          txId={transactionState.txId}
          errorMessage={transactionState.errorMessage}
          network={network}
          transactionDetails={transactionDetails}
          onClose={handleCloseModal}
        />
      )}
    </>
  );
}
