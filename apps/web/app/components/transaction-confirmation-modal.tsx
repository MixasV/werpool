'use client';

import { TransactionStatus } from '../hooks/useFlowTransaction';

interface TransactionConfirmationModalProps {
  isOpen: boolean;
  status: TransactionStatus;
  txId: string | null;
  errorMessage: string | null;
  network: string;
  transactionDetails?: {
    type: string;
    amount?: string;
    marketTitle?: string;
    outcome?: string;
  };
  onClose: () => void;
}

export function TransactionConfirmationModal({
  isOpen,
  status,
  txId,
  errorMessage,
  network,
  transactionDetails,
  onClose,
}: TransactionConfirmationModalProps) {
  if (!isOpen) return null;

  const getStatusDisplay = () => {
    switch (status) {
      case 'signing':
        return {
          title: 'Confirm in Wallet',
          message: 'Please confirm the transaction in your wallet extension',
          icon: '🔐',
          color: 'text-blue-600',
        };
      case 'pending':
        return {
          title: 'Transaction Submitted',
          message: 'Your transaction has been submitted to the blockchain',
          icon: '⏳',
          color: 'text-yellow-600',
        };
      case 'finalized':
        return {
          title: 'Finalizing',
          message: 'Transaction is being finalized on the blockchain',
          icon: '🔄',
          color: 'text-yellow-600',
        };
      case 'executed':
        return {
          title: 'Executing',
          message: 'Transaction is being executed',
          icon: '⚙️',
          color: 'text-yellow-600',
        };
      case 'sealed':
        return {
          title: 'Transaction Successful',
          message: 'Your transaction has been successfully completed',
          icon: '✅',
          color: 'text-green-600',
        };
      case 'error':
        return {
          title: 'Transaction Failed',
          message: errorMessage || 'An error occurred while processing the transaction',
          icon: '❌',
          color: 'text-red-600',
        };
      default:
        return {
          title: 'Processing',
          message: 'Processing your transaction',
          icon: '⏳',
          color: 'text-gray-600',
        };
    }
  };

  const statusDisplay = getStatusDisplay();
  const explorerUrl = network === 'testnet' 
    ? `https://testnet.flowscan.io/transaction/${txId}`
    : `https://flowscan.io/transaction/${txId}`;

  const progressPercentage = (): number => {
    switch (status) {
      case 'signing':
        return 10;
      case 'pending':
        return 25;
      case 'finalized':
        return 50;
      case 'executed':
        return 75;
      case 'sealed':
        return 100;
      default:
        return 0;
    }
  };

  return (
    <div className="transaction-modal-overlay" onClick={status === 'sealed' || status === 'error' ? onClose : undefined}>
      <div className="transaction-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="transaction-modal-header">
          <h2 className={`transaction-modal-title ${statusDisplay.color}`}>
            <span className="transaction-icon">{statusDisplay.icon}</span>
            {statusDisplay.title}
          </h2>
          {(status === 'sealed' || status === 'error') && (
            <button
              type="button"
              className="transaction-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>

        <div className="transaction-modal-body">
          <p className="transaction-message">{statusDisplay.message}</p>

          {transactionDetails && (
            <div className="transaction-details">
              <h3>Transaction Details</h3>
              <dl>
                <dt>Type:</dt>
                <dd>{transactionDetails.type}</dd>
                {transactionDetails.marketTitle && (
                  <>
                    <dt>Market:</dt>
                    <dd>{transactionDetails.marketTitle}</dd>
                  </>
                )}
                {transactionDetails.outcome && (
                  <>
                    <dt>Outcome:</dt>
                    <dd>{transactionDetails.outcome}</dd>
                  </>
                )}
                {transactionDetails.amount && (
                  <>
                    <dt>Amount:</dt>
                    <dd>{transactionDetails.amount}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {status !== 'error' && status !== 'idle' && status !== 'signing' && (
            <div className="transaction-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progressPercentage()}%` }}
                />
              </div>
              <div className="progress-steps">
                <div className={`step ${['pending', 'finalized', 'executed', 'sealed'].includes(status) ? 'active' : ''}`}>
                  Pending
                </div>
                <div className={`step ${['finalized', 'executed', 'sealed'].includes(status) ? 'active' : ''}`}>
                  Finalized
                </div>
                <div className={`step ${['executed', 'sealed'].includes(status) ? 'active' : ''}`}>
                  Executed
                </div>
                <div className={`step ${status === 'sealed' ? 'active' : ''}`}>
                  Sealed
                </div>
              </div>
            </div>
          )}

          {txId && (
            <div className="transaction-id">
              <p>Transaction ID:</p>
              <code className="tx-id-code">{txId}</code>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="explorer-link"
              >
                View on FlowScan ↗
              </a>
            </div>
          )}
        </div>

        {(status === 'sealed' || status === 'error') && (
          <div className="transaction-modal-footer">
            <button
              type="button"
              className="button primary"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
