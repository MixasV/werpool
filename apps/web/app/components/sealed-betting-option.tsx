'use client';

import { useState } from 'react';

interface SealedBettingOptionProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  marketCloseAt?: Date;
}

export function SealedBettingOption({ 
  enabled, 
  onToggle, 
  marketCloseAt 
}: SealedBettingOptionProps) {
  const [showInfo, setShowInfo] = useState(false);

  const autoRevealDate = marketCloseAt 
    ? new Date(marketCloseAt.getTime() + 30 * 24 * 60 * 60 * 1000)
    : null;

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-3">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="sealed-betting"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="sealed-betting" className="text-sm font-medium text-white cursor-pointer">
            Use Sealed Betting (Privacy Mode)
          </label>
        </div>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="text-gray-400 hover:text-white text-sm"
        >
          {showInfo ? '▼' : '▶'} Info
        </button>
      </div>

      {/* Warning when enabled */}
      {enabled && (
        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded p-3 text-sm">
          <div className="text-yellow-200 font-medium mb-1">⚠️ Sealed Betting Enabled</div>
          <div className="text-yellow-100/80 space-y-1">
            <p>Your bet outcome will be hidden until market closes.</p>
            {autoRevealDate && (
              <p className="text-xs">
                Auto-reveal scheduled: {autoRevealDate.toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Info Panel */}
      {showInfo && (
        <div className="bg-gray-900 rounded p-4 text-sm text-gray-300 space-y-3">
          <div>
            <h4 className="text-white font-medium mb-1">What is Sealed Betting?</h4>
            <p className="text-gray-400">
              Sealed betting hides your outcome choice until the market closes. 
              This prevents front-running and provides privacy for large trades.
            </p>
          </div>

          <div>
            <h4 className="text-white font-medium mb-1">How it works:</h4>
            <ol className="list-decimal list-inside space-y-1 text-gray-400">
              <li>Your bet is encrypted and stored on-chain</li>
              <li>Outcome is hidden from everyone (including you!)</li>
              <li>After market closes, you can reveal manually</li>
              <li>Or wait for auto-reveal (+30 days) - guaranteed payout!</li>
            </ol>
          </div>

          <div>
            <h4 className="text-white font-medium mb-1">Zero Forfeit Risk:</h4>
            <p className="text-gray-400">
              Even if you forget to reveal, the auto-reveal mechanism will 
              automatically claim your winnings after 30 days. You never lose!
            </p>
          </div>

          <div className="pt-2 border-t border-gray-700">
            <h4 className="text-white font-medium mb-1">Best for:</h4>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li>Large trades (whales)</li>
              <li>Avoiding market manipulation</li>
              <li>Maximum privacy</li>
            </ul>
          </div>

          <div className="bg-blue-900/30 border border-blue-700/50 rounded p-2 text-xs text-blue-200">
            💡 Tip: Regular betting is simpler. Only use sealed betting if you need privacy.
          </div>
        </div>
      )}

      {/* Status */}
      {!enabled && (
        <div className="text-xs text-gray-500">
          Standard betting: Your outcome is visible immediately
        </div>
      )}
    </div>
  );
}
