'use client';

import { useState } from 'react';
import type { RolePurchaseRequest } from '../lib/roles-api';
import { requestRolePurchase } from '../lib/roles-api';

interface RolePurchaseSectionProps {
  currentPoints: number;
  hasPatrolRole: boolean;
  initialRequests: RolePurchaseRequest[];
}

const PATROL_COST = 20000;

export function RolePurchaseSection({
  currentPoints,
  hasPatrolRole,
  initialRequests,
}: RolePurchaseSectionProps) {
  const [requests, setRequests] = useState<RolePurchaseRequest[]>(initialRequests);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canPurchase = currentPoints >= PATROL_COST && !hasPatrolRole;
  const hasPendingRequest = requests.some(
    (r) => r.status === 'PENDING' || r.status === 'APPROVED'
  );

  async function handlePurchase() {
    if (!canPurchase || hasPendingRequest) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const newRequest = await requestRolePurchase();
      setRequests([newRequest, ...requests]);
      setSuccess(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="role-purchase-section">
      <div className="section-header">
        <h2>🔓 Unlock PATROL Role</h2>
        <p className="section-description">
          Spend 20,000 points to request PATROL role access. PATROL members can flag suspicious markets and help maintain platform integrity.
        </p>
      </div>

      <div className="purchase-card">
        <div className="purchase-info">
          <div className="cost-display">
            <span className="cost-label">Role Cost:</span>
            <span className="cost-value">{PATROL_COST.toLocaleString()} points</span>
          </div>
          <div className="balance-display">
            <span className="balance-label">Your Balance:</span>
            <span className={`balance-value ${canPurchase ? 'sufficient' : 'insufficient'}`}>
              {currentPoints.toLocaleString()} points
            </span>
          </div>
        </div>

        {hasPatrolRole ? (
          <div className="status-badge status-badge--success">
            ✓ PATROL Role Active
          </div>
        ) : hasPendingRequest ? (
          <div className="status-badge status-badge--pending">
            ⏳ Request Pending Approval
          </div>
        ) : (
          <button
            className="purchase-button"
            onClick={handlePurchase}
            disabled={!canPurchase || loading}
          >
            {loading ? 'Processing...' : canPurchase ? 'Unlock PATROL Role' : 'Insufficient Points'}
          </button>
        )}
      </div>

      {error && (
        <div className="message message--error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {success && (
        <div className="message message--success">
          <strong>Success!</strong> Your request has been submitted and is pending approval.
        </div>
      )}

      {requests.length > 0 && (
        <div className="requests-list">
          <h3>Your Requests</h3>
          <div className="requests-table">
            {requests.map((request) => (
              <div key={request.id} className="request-row">
                <div className="request-info">
                  <span className="request-role">{request.role}</span>
                  <span className="request-date">
                    {new Date(request.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="request-details">
                  <span className="request-cost">-{request.pointsSpent.toLocaleString()} pts</span>
                  <span className={`request-status request-status--${request.status.toLowerCase()}`}>
                    {request.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .role-purchase-section {
          margin: 2rem 0;
          padding: 2rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-radius: 12px;
        }

        .section-header h2 {
          margin: 0 0 0.5rem 0;
          font-size: 1.5rem;
          font-weight: 600;
        }

        .section-description {
          margin: 0;
          opacity: 0.9;
        }

        .purchase-card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          padding: 1.5rem;
          border-radius: 8px;
          margin: 1.5rem 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 2rem;
          flex-wrap: wrap;
        }

        .purchase-info {
          display: flex;
          gap: 3rem;
        }

        .cost-display,
        .balance-display {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .cost-label,
        .balance-label {
          font-size: 0.875rem;
          opacity: 0.8;
        }

        .cost-value,
        .balance-value {
          font-size: 1.5rem;
          font-weight: 700;
        }

        .balance-value.sufficient {
          color: #10b981;
        }

        .balance-value.insufficient {
          color: #ef4444;
        }

        .purchase-button {
          background: white;
          color: #667eea;
          border: none;
          padding: 0.75rem 2rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .purchase-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .purchase-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .status-badge {
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 600;
          text-align: center;
        }

        .status-badge--success {
          background: rgba(16, 185, 129, 0.2);
          border: 2px solid #10b981;
        }

        .status-badge--pending {
          background: rgba(251, 191, 36, 0.2);
          border: 2px solid #fbbf24;
        }

        .message {
          padding: 1rem;
          border-radius: 8px;
          margin: 1rem 0;
        }

        .message--error {
          background: rgba(239, 68, 68, 0.2);
          border: 2px solid #ef4444;
        }

        .message--success {
          background: rgba(16, 185, 129, 0.2);
          border: 2px solid #10b981;
        }

        .requests-list {
          margin-top: 2rem;
        }

        .requests-list h3 {
          margin: 0 0 1rem 0;
          font-size: 1.125rem;
          font-weight: 600;
        }

        .requests-table {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border-radius: 8px;
          overflow: hidden;
        }

        .request-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .request-row:last-child {
          border-bottom: none;
        }

        .request-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .request-role {
          font-weight: 600;
        }

        .request-date {
          font-size: 0.875rem;
          opacity: 0.8;
        }

        .request-details {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.25rem;
        }

        .request-cost {
          font-weight: 700;
        }

        .request-status {
          padding: 0.25rem 0.75rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .request-status--pending {
          background: rgba(251, 191, 36, 0.2);
          color: #fbbf24;
        }

        .request-status--approved {
          background: rgba(59, 130, 246, 0.2);
          color: #3b82f6;
        }

        .request-status--completed {
          background: rgba(16, 185, 129, 0.2);
          color: #10b981;
        }

        .request-status--declined {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }

        @media (max-width: 768px) {
          .purchase-card {
            flex-direction: column;
            align-items: stretch;
          }

          .purchase-info {
            flex-direction: column;
            gap: 1rem;
          }
        }
      `}</style>
    </div>
  );
}
