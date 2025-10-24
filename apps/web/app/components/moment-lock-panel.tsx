'use client';

import { useState, useEffect } from 'react';
import type { TopShotMoment, MomentLock } from '../lib/topshot-api';
import { getUserMoments, lockMoment, updateMomentLock, releaseMomentLock, getUserMomentLocks } from '../lib/topshot-api';

interface MomentLockPanelProps {
  marketId: string;
  eventId: string;
  outcomes: Array<{ id: string; label: string; index: number }>;
  userAddress: string | null;
  onLockCreated?: () => void;
}

export function MomentLockPanel({
  marketId,
  eventId,
  outcomes,
  userAddress,
  onLockCreated,
}: MomentLockPanelProps) {
  const [moments, setMoments] = useState<TopShotMoment[]>([]);
  const [activeLock, setActiveLock] = useState<MomentLock | null>(null);
  const [selectedMoment, setSelectedMoment] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!userAddress) {
      setLoading(false);
      return;
    }

    const address = userAddress;

    async function loadData() {
      try {
        const [userMoments, locks] = await Promise.all([
          getUserMoments(address),
          getUserMomentLocks(address),
        ]);

        setMoments(userMoments);

        const marketLock = locks.find(
          (lock) => lock.marketId === marketId && lock.status === 'ACTIVE'
        );
        setActiveLock(marketLock || null);

        if (marketLock) {
          setSelectedMoment(marketLock.momentId);
          setSelectedOutcome(marketLock.outcomeIndex);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [userAddress, marketId]);

  async function handleLockMoment() {
    if (!selectedMoment || !userAddress) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const lock = await lockMoment({
        marketId,
        eventId,
        momentId: selectedMoment,
        outcomeIndex: selectedOutcome,
      });

      setActiveLock(lock);
      setSuccess('Moment locked successfully! You will earn bonus points if your team wins.');
      onLockCreated?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateLock() {
    if (!activeLock) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateMomentLock(activeLock.id, selectedOutcome);
      setActiveLock(updated);
      setSuccess('Lock updated successfully!');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReleaseLock() {
    if (!activeLock) return;

    if (!confirm('Are you sure you want to release this lock? You will not earn bonus points.')) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await releaseMomentLock(activeLock.id);
      setActiveLock(null);
      setSelectedMoment(null);
      setSuccess('Lock released successfully.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!userAddress) {
    return (
      <div className="moment-lock-panel">
        <div className="panel-header">
          <h3>🏀 Boost with NBA Top Shot</h3>
          <p>Connect wallet to lock your moments and earn bonus points</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="moment-lock-panel">
        <div className="panel-header">
          <h3>🏀 Boost with NBA Top Shot</h3>
        </div>
        <p className="loading">Loading your moments...</p>
      </div>
    );
  }

  if (moments.length === 0) {
    return (
      <div className="moment-lock-panel">
        <div className="panel-header">
          <h3>🏀 Boost with NBA Top Shot</h3>
          <p>No NBA Top Shot moments found in your wallet</p>
        </div>
      </div>
    );
  }

  const canChange = activeLock && new Date() < new Date(activeLock.changeDeadline);

  return (
    <div className="moment-lock-panel">
      <div className="panel-header">
        <h3>🏀 Boost with NBA Top Shot</h3>
        <p>Lock a moment to earn bonus points based on player performance</p>
      </div>

      {activeLock && (
        <div className="active-lock-banner">
          <div className="lock-info">
            <span className="lock-label">Locked Moment:</span>
            <span className="lock-value">{activeLock.playerName || 'Unknown Player'}</span>
            <span className="lock-details">
              {activeLock.rarity} · Outcome: {outcomes[activeLock.outcomeIndex]?.label}
            </span>
          </div>
          {canChange ? (
            <span className="change-deadline">
              Can change until {new Date(activeLock.changeDeadline).toLocaleString()}
            </span>
          ) : (
            <span className="locked-badge">🔒 Locked</span>
          )}
        </div>
      )}

      <div className="moment-selector">
        <label>Select Moment:</label>
        <select
          value={selectedMoment || ''}
          onChange={(e) => setSelectedMoment(e.target.value)}
          disabled={!!activeLock && !canChange}
          className="moment-select"
        >
          <option value="">Choose a moment...</option>
          {moments.map((moment) => (
            <option key={moment.id} value={moment.id}>
              {moment.play.stats.playerName} #{moment.serialNumber} ({moment.tier})
            </option>
          ))}
        </select>
      </div>

      <div className="outcome-selector">
        <label>Pick Outcome:</label>
        <div className="outcome-buttons">
          {outcomes.map((outcome) => (
            <button
              key={outcome.index}
              className={`outcome-button ${selectedOutcome === outcome.index ? 'selected' : ''}`}
              onClick={() => setSelectedOutcome(outcome.index)}
              disabled={!!activeLock && !canChange}
            >
              {outcome.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="message message--error">{error}</div>}
      {success && <div className="message message--success">{success}</div>}

      <div className="action-buttons">
        {activeLock ? (
          <>
            {canChange && (
              <>
                <button
                  className="btn btn--primary"
                  onClick={handleUpdateLock}
                  disabled={submitting || selectedOutcome === activeLock.outcomeIndex}
                >
                  {submitting ? 'Updating...' : 'Update Lock'}
                </button>
                <button
                  className="btn btn--secondary"
                  onClick={handleReleaseLock}
                  disabled={submitting}
                >
                  Release Lock
                </button>
              </>
            )}
          </>
        ) : (
          <button
            className="btn btn--primary"
            onClick={handleLockMoment}
            disabled={!selectedMoment || submitting}
          >
            {submitting ? 'Locking...' : 'Lock Moment'}
          </button>
        )}
      </div>

      <div className="info-box">
        <h4>How it works:</h4>
        <ul>
          <li>Lock one of your Top Shot moments to an outcome</li>
          <li>Earn bonus points based on player performance if your team wins</li>
          <li>Rarity multipliers: Common 1.0x, Rare 1.2x, Legendary 1.5x, Ultimate 1.8x</li>
          <li>Daily cap: 300 points per day from Top Shot rewards</li>
          <li>You can change your pick until 1 hour before the event starts</li>
        </ul>
      </div>

      <style jsx>{`
        .moment-lock-panel {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 12px;
          padding: 1.5rem;
          color: white;
          margin: 2rem 0;
        }

        .panel-header {
          margin-bottom: 1.5rem;
        }

        .panel-header h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1.25rem;
        }

        .panel-header p {
          margin: 0;
          opacity: 0.9;
          font-size: 0.875rem;
        }

        .active-lock-banner {
          background: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(10px);
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .lock-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .lock-label {
          font-size: 0.75rem;
          opacity: 0.8;
          text-transform: uppercase;
        }

        .lock-value {
          font-size: 1.125rem;
          font-weight: 600;
        }

        .lock-details {
          font-size: 0.875rem;
          opacity: 0.8;
        }

        .change-deadline {
          font-size: 0.75rem;
          background: rgba(251, 191, 36, 0.2);
          padding: 0.5rem 1rem;
          border-radius: 4px;
        }

        .locked-badge {
          font-size: 0.875rem;
          background: rgba(16, 185, 129, 0.2);
          padding: 0.5rem 1rem;
          border-radius: 4px;
          font-weight: 600;
        }

        .moment-selector,
        .outcome-selector {
          margin-bottom: 1.5rem;
        }

        label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 600;
          font-size: 0.875rem;
        }

        .moment-select {
          width: 100%;
          padding: 0.75rem;
          border-radius: 8px;
          border: 2px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.1);
          color: white;
          font-size: 1rem;
        }

        .moment-select:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .outcome-buttons {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .outcome-button {
          flex: 1;
          min-width: 100px;
          padding: 0.75rem 1rem;
          border: 2px solid rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .outcome-button:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.2);
          border-color: rgba(255, 255, 255, 0.5);
        }

        .outcome-button.selected {
          background: white;
          color: #667eea;
          border-color: white;
        }

        .outcome-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .message {
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
        }

        .message--error {
          background: rgba(239, 68, 68, 0.2);
          border: 2px solid #ef4444;
        }

        .message--success {
          background: rgba(16, 185, 129, 0.2);
          border: 2px solid #10b981;
        }

        .action-buttons {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }

        .btn {
          flex: 1;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          font-size: 1rem;
        }

        .btn--primary {
          background: white;
          color: #667eea;
        }

        .btn--primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .btn--secondary {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border: 2px solid rgba(255, 255, 255, 0.3);
        }

        .btn--secondary:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.2);
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .info-box {
          background: rgba(0, 0, 0, 0.2);
          padding: 1rem;
          border-radius: 8px;
        }

        .info-box h4 {
          margin: 0 0 0.75rem 0;
          font-size: 0.875rem;
          font-weight: 600;
        }

        .info-box ul {
          margin: 0;
          padding-left: 1.5rem;
          font-size: 0.875rem;
          opacity: 0.9;
        }

        .info-box li {
          margin-bottom: 0.5rem;
        }

        .loading {
          text-align: center;
          padding: 2rem;
          opacity: 0.8;
        }

        @media (max-width: 768px) {
          .action-buttons {
            flex-direction: column;
          }

          .btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
