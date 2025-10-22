"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFlowWallet } from "../providers/flow-wallet-provider";

interface RolePurchaseRequest {
  id: string;
  userAddress: string;
  role: string;
  pointsSpent: number;
  status: string;
  notes?: string;
  processedBy?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface RolePurchaseRequestsPanelProps {
  initialRequests: RolePurchaseRequest[];
}

const formatDateTime = (value: string): string => {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const getStatusBadgeClass = (status: string): string => {
  switch (status.toLowerCase()) {
    case "pending":
      return "admin-badge admin-badge--warning";
    case "approved":
      return "admin-badge admin-badge--info";
    case "completed":
      return "admin-badge admin-badge--success";
    case "declined":
      return "admin-badge admin-badge--error";
    default:
      return "admin-badge";
  }
};

export const RolePurchaseRequestsPanel = ({
  initialRequests,
}: RolePurchaseRequestsPanelProps) => {
  const router = useRouter();
  const { sessionToken, loggedIn, isAuthenticating } = useFlowWallet();

  const [requests, setRequests] = useState<RolePurchaseRequest[]>(initialRequests);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [declineNotesId, setDeclineNotesId] = useState<string | null>(null);
  const [declineNotes, setDeclineNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setRequests(initialRequests);
  }, [initialRequests]);

  const handleApprove = async (requestId: string) => {
    if (!loggedIn || !sessionToken) {
      setError("You must be logged in to approve requests");
      return;
    }

    setError(null);
    setStatus(`Approving request ${requestId}...`);
    setProcessingId(requestId);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/admin/role-purchase/${requestId}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            notes: "Approved by admin",
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const updated = await response.json();
      setRequests((prev) =>
        prev.map((req) => (req.id === requestId ? updated : req))
      );
      setStatus("Request approved successfully");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to approve request";
      setError(message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (requestId: string) => {
    if (!loggedIn || !sessionToken) {
      setError("You must be logged in to decline requests");
      return;
    }

    setError(null);
    setStatus(`Declining request ${requestId}...`);
    setProcessingId(requestId);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/admin/role-purchase/${requestId}/decline`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            notes: declineNotes || "Declined by admin",
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const updated = await response.json();
      setRequests((prev) =>
        prev.map((req) => (req.id === requestId ? updated : req))
      );
      setStatus("Request declined successfully");
      setDeclineNotesId(null);
      setDeclineNotes("");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to decline request";
      setError(message);
    } finally {
      setProcessingId(null);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === "PENDING");
  const processedRequests = requests.filter((r) => r.status !== "PENDING");

  return (
    <>
      <div className="admin-section">
        <h2 className="admin-section__title">Pending Role Purchase Requests</h2>
        {pendingRequests.length === 0 ? (
          <p className="muted">No pending requests</p>
        ) : (
          <div className="admin-table">
            <div className="admin-table__header">
              <span>User Address</span>
              <span>Role</span>
              <span>Points</span>
              <span>Requested</span>
              <span>Actions</span>
            </div>
            {pendingRequests.map((request) => (
              <div key={request.id} className="admin-table__row">
                <span className="admin-table__address">{request.userAddress}</span>
                <span className={getStatusBadgeClass(request.role)}>
                  {request.role}
                </span>
                <span>{request.pointsSpent.toLocaleString()}</span>
                <span>{formatDateTime(request.createdAt)}</span>
                <div className="admin-table__actions">
                  {declineNotesId === request.id ? (
                    <div className="admin-table__decline-form">
                      <input
                        type="text"
                        placeholder="Reason for decline (optional)"
                        value={declineNotes}
                        onChange={(e) => setDeclineNotes(e.target.value)}
                        disabled={processingId === request.id}
                      />
                      <button
                        type="button"
                        className="button tertiary"
                        onClick={() => handleDecline(request.id)}
                        disabled={
                          processingId === request.id ||
                          !loggedIn ||
                          isAuthenticating
                        }
                      >
                        {processingId === request.id ? "Declining..." : "Confirm"}
                      </button>
                      <button
                        type="button"
                        className="button tertiary"
                        onClick={() => {
                          setDeclineNotesId(null);
                          setDeclineNotes("");
                        }}
                        disabled={processingId === request.id}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="button primary"
                        onClick={() => handleApprove(request.id)}
                        disabled={
                          processingId === request.id ||
                          !loggedIn ||
                          isAuthenticating
                        }
                      >
                        {processingId === request.id ? "Approving..." : "Approve"}
                      </button>
                      <button
                        type="button"
                        className="button tertiary"
                        onClick={() => setDeclineNotesId(request.id)}
                        disabled={processingId !== null}
                      >
                        Decline
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {status && <p className="status-text">{status}</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="admin-section">
        <h2 className="admin-section__title">Processed Requests History</h2>
        {processedRequests.length === 0 ? (
          <p className="muted">No processed requests yet</p>
        ) : (
          <div className="admin-table">
            <div className="admin-table__header">
              <span>User Address</span>
              <span>Role</span>
              <span>Status</span>
              <span>Processed By</span>
              <span>Processed At</span>
              <span>Notes</span>
            </div>
            {processedRequests.map((request) => (
              <div key={request.id} className="admin-table__row">
                <span className="admin-table__address">{request.userAddress}</span>
                <span className={getStatusBadgeClass(request.role)}>
                  {request.role}
                </span>
                <span className={getStatusBadgeClass(request.status)}>
                  {request.status}
                </span>
                <span>{request.processedBy || "—"}</span>
                <span>
                  {request.processedAt ? formatDateTime(request.processedAt) : "—"}
                </span>
                <span className="admin-table__notes">{request.notes || "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};
