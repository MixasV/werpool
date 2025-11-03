"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useFlowWallet } from "../providers/flow-wallet-provider";
import { OnboardingDialog } from "./onboarding-dialog";

const formatAddress = (address?: string | null) => {
  if (!address) {
    return "—";
  }
  const normalized = address.startsWith("0x") ? address.slice(2) : address;
  if (normalized.length <= 8) {
    return `0x${normalized}`;
  }
  return `0x${normalized.slice(0, 4)}…${normalized.slice(-4)}`;
};

export const AppHeader = () => {
  const {
    addr,
    loggedIn,
    isReady,
    network,
    logIn,
    logOut,
    sessionRoles,
    isAuthenticating,
    sessionError,
  } = useFlowWallet();
  const [isOnboardingOpen, setOnboardingOpen] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [onboardingTab, setOnboardingTab] = useState<"wallet" | "custodial">("wallet");
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

  const isAdmin = sessionRoles.includes("admin");
  const isOperator = sessionRoles.includes("operator");
  const rolesLabel = sessionRoles.length > 0 ? sessionRoles.join(" · ") : null;
  const networkLabel = network === "testnet" ? "Flow Testnet" : network === "mainnet" ? "Flow Mainnet" : "Flow Emulator";

  const connectionStatus: "connected" | "auth" | "disconnected" = isAuthenticating
    ? "auth"
    : loggedIn
      ? "connected"
      : "disconnected";

  const handleConnect = async () => {
    if (!isReady || isAuthenticating) {
      return;
    }

    setConnectError(null);
    try {
      await logIn();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open Flow wallet";
      setConnectError(message);
      setOnboardingTab("wallet");
      setOnboardingError(message);
      setOnboardingOpen(true);
    }
  };

  useEffect(() => {
    if (loggedIn) {
      setOnboardingOpen(false);
      setConnectError(null);
      setOnboardingError(null);
    }
  }, [loggedIn]);

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <nav className="app-header__nav">
          <Link href="/" className="app-header__brand">
            Werpool
            <span className="app-header__tagline">Your forecast is your asset</span>
          </Link>
          <div className="app-header__links">
            <Link href="/" className="app-header__link">
              Home
            </Link>
            <Link href="/markets" className="app-header__link">
              Markets
            </Link>
            <Link href="/fastbreak/challenges" className="app-header__link">
              FastBreak
            </Link>
            {/* <Link href="/leaderboard" className="app-header__link">
              Leaderboard
            </Link>
            <Link href="/claim" className="app-header__link">
              Claims
            </Link> */}
            {isAdmin && (
              <Link href="/markets/create" className="app-header__link">
                Launch market
              </Link>
            )}
            {(isAdmin || isOperator) && (
              <Link href="/admin" className="app-header__link">
                Admin
              </Link>
            )}
            {loggedIn && (
              <Link href="/profile" className="app-header__link">
                Portfolio
              </Link>
            )}
          </div>
        </nav>
        <div className="app-header__actions">
          <div className="app-header__identity">
            <span className="app-header__address">
              {loggedIn ? formatAddress(addr) : "Wallet disconnected"}
            </span>
            <div className="app-header__session">
              <span className="app-header__network" data-status={connectionStatus}>
                {connectionStatus === "auth"
                  ? "Authenticating"
                  : connectionStatus === "connected"
                    ? `${networkLabel}`
                    : "Disconnected"}
              </span>
              {loggedIn && rolesLabel && (
                <span className="app-header__roles">{rolesLabel}</span>
              )}
              {loggedIn && !rolesLabel && !isAuthenticating && (
                <span className="app-header__roles app-header__roles--muted">No roles assigned</span>
              )}
              {isAuthenticating && (
                <span className="app-header__status">Awaiting signature…</span>
              )}
              {connectError && !loggedIn && !isAuthenticating && (
                <span className="app-header__error">{connectError}</span>
              )}
              {sessionError && (
                <span className="app-header__error">{sessionError}</span>
              )}
            </div>
          </div>
          {loggedIn ? (
            <button
              type="button"
              className="button tertiary"
              onClick={() => {
                void logOut();
              }}
            >
              Disconnect
            </button>
          ) : (
            <div className="app-header__connect">
              <button
                type="button"
                className="button"
                disabled={!isReady || isAuthenticating}
                onClick={() => {
                  void handleConnect();
                }}
              >
                Connect wallet
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setConnectError(null);
                  setOnboardingError(null);
                  setOnboardingTab("custodial");
                  setOnboardingOpen(true);
                }}
              >
                More options
              </button>
            </div>
          )}
        </div>
        <OnboardingDialog
          open={isOnboardingOpen}
          onClose={() => setOnboardingOpen(false)}
          initialTab={onboardingTab}
          initialError={onboardingError}
        />
      </div>
    </header>
  );
};
