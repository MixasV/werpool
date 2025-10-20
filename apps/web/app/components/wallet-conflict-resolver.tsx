'use client';

import { useEffect, useState } from 'react';
import { Web3WalletDetection, BrowserDetection } from '../lib/browser-detection';

/**
 * Component to detect and help resolve wallet conflicts
 * Primarily for Brave Browser with multiple wallet extensions
 */
export function WalletConflictResolver() {
  const [hasConflict, setHasConflict] = useState(false);
  const [detectedWallets, setDetectedWallets] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check for wallet conflicts
    const conflict = Web3WalletDetection.hasWalletConflict();
    const wallets = Web3WalletDetection.getDetectedWallets();
    
    setHasConflict(conflict);
    setDetectedWallets(wallets);

    // Check if user previously dismissed
    const wasDismissed = sessionStorage.getItem('wallet-conflict-dismissed');
    if (wasDismissed) {
      setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('wallet-conflict-dismissed', 'true');
  };

  const handleConfigureBrave = () => {
    if (BrowserDetection.isBrave()) {
      // Show instructions for Brave settings
      alert(
        'To fix wallet conflicts in Brave:\n\n' +
        '1. Open Brave Settings (brave://settings/web3)\n' +
        '2. Go to Web3 section\n' +
        '3. Set "Default Ethereum wallet" to your preferred wallet\n' +
        '4. Disable "Use Dapps with Brave Wallet" if using MetaMask\n' +
        '5. Refresh this page'
      );
    }
  };

  if (!hasConflict || dismissed || detectedWallets.length === 0) {
    return null;
  }

  return (
    <div 
      className="wallet-conflict-modal"
      role="alert"
      aria-live="polite"
    >
      <div className="wallet-conflict-content">
        <h3>Multiple Wallets Detected</h3>
        <p>
          We detected {detectedWallets.length} wallet{detectedWallets.length > 1 ? 's' : ''}: {detectedWallets.join(', ')}.
          This may cause connection issues.
        </p>
        <div className="wallet-conflict-actions">
          {BrowserDetection.isBrave() && (
            <button 
              type="button"
              className="button secondary" 
              onClick={handleConfigureBrave}
            >
              Fix Brave Settings
            </button>
          )}
          <button 
            type="button"
            className="button tertiary" 
            onClick={handleDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
