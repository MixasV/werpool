"use client";

import { FormEvent, useMemo, useState } from "react";

import { useFlowWallet } from "../providers/flow-wallet-provider";

interface OnboardingDialogProps {
  open: boolean;
  onClose: () => void;
}

type Tab = "wallet" | "custodial";

export const OnboardingDialog = ({ open, onClose }: OnboardingDialogProps) => {
  const {
    logIn,
    requestCustodialLogin,
    completeCustodialLogin,
    custodialState,
  } = useFlowWallet();

  const [activeTab, setActiveTab] = useState<Tab>("wallet");
  const [email, setEmail] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verificationToken = useMemo(() => {
    if (custodialState.email && custodialState.email === email.trim().toLowerCase()) {
      return custodialState.verificationToken ?? null;
    }
    return null;
  }, [custodialState, email]);

  if (!open) {
    return null;
  }

  const handleWalletLogin = async () => {
    setError(null);
    setStatus(null);
    try {
      await logIn();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not start the FCL login flow";
      setError(message);
    }
  };

  const handleRequestCustodial = async (evt: FormEvent) => {
    evt.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter your email");
      return;
    }
    setPending(true);
    setError(null);
    setStatus(null);
    try {
      const response = await requestCustodialLogin(normalizedEmail);
      setEmail(normalizedEmail);
      setTokenInput(response.verificationToken);
      setStatus("Magic link sent. Use the token from your email to finish signing in.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "We could not send the magic link";
      setError(message);
    } finally {
      setPending(false);
    }
  };

  const handleVerifyCustodial = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !tokenInput.trim()) {
      setError("Enter your email and confirmation token");
      return;
    }
    setPending(true);
    setError(null);
    setStatus(null);
    try {
      await completeCustodialLogin({ email: normalizedEmail, token: tokenInput.trim() });
      setStatus("You are now signed in");
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Token verification failed";
      setError(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true">
      <div className="onboarding-card">
        <header className="onboarding-card__header">
          <h2>Connect to Werpool</h2>
          <button type="button" className="link-button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="onboarding-tabs">
          <button
            type="button"
            className="onboarding-tabs__trigger"
            data-active={activeTab === "wallet"}
            onClick={() => setActiveTab("wallet")}
          >
            Flow Wallet
          </button>
          <button
            type="button"
            className="onboarding-tabs__trigger"
            data-active={activeTab === "custodial"}
            onClick={() => setActiveTab("custodial")}
          >
            Email custodial
          </button>
        </div>

        {activeTab === "wallet" && (
          <div className="onboarding-pane">
            <p>
              Use any Flow-compatible wallet (Blocto, Lilico, Dapper). If you are on Brave, set
              MetaMask as the preferred extension wallet. After signing a message we will sync your
              Werpool session and roles.
            </p>
            <button type="button" className="button" onClick={handleWalletLogin} disabled={pending}>
              Connect with FCL
            </button>
          </div>
        )}

        {activeTab === "custodial" && (
          <div className="onboarding-pane">
            <p>
              Enter an email to request a custodial session. We will generate a verification token.
              On mobile, use WalletConnect if you want to switch to a self-custody wallet later.
            </p>
            <form className="onboarding-form" onSubmit={handleRequestCustodial}>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  required
                />
              </label>
              <button type="submit" className="button secondary" disabled={pending}>
                Send magic link
              </button>
            </form>
            {verificationToken && (
              <div className="onboarding-token">
                <span className="onboarding-token__label">Confirmation token</span>
                <code>{verificationToken}</code>
              </div>
            )}
            <div className="onboarding-form onboarding-form--inline">
              <label>
                Enter token
                <input
                  type="text"
                  value={tokenInput}
                  onChange={(event) => setTokenInput(event.target.value)}
                  placeholder="xxxxxxxx"
                />
              </label>
              <button
                type="button"
                className="button"
                onClick={handleVerifyCustodial}
                disabled={pending || !tokenInput}
              >
                Confirm
              </button>
            </div>
          </div>
        )}

        {status && <div className="onboarding-status">{status}</div>}
        {error && <div className="onboarding-error">{error}</div>}
      </div>
    </div>
  );
};
