"use client";

import * as fcl from "@onflow/fcl";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { initFlowConfig } from "../lib/flow-config";
import { resolveFlowConfig } from "../lib/flow-network";
import {
  fetchCurrentSession,
  logoutSession,
  requestFlowChallenge,
  verifyFlowSignature,
  requestCustodialLogin,
  verifyCustodialLogin,
  type FlowSessionInfo,
} from "../lib/flow-auth-api";
import { setSessionToken } from "../lib/api-client";

interface FlowUserSnapshot {
  addr: string | null;
  loggedIn: boolean;
  expiresAt?: string | null;
  services?: Array<Record<string, unknown>>;
}

type AuthMode = "wallet" | "custodial";

interface CustodialState {
  email: string | null;
  address: string | null;
  verificationToken?: string | null;
  expiresAt?: string | null;
}

interface FlowWalletContextValue {
  user: FlowUserSnapshot | null;
  addr: string | null;
  loggedIn: boolean;
  isReady: boolean;
  network: string;
  sessionToken: string | null;
  sessionRoles: string[];
  sessionExpiresAt: string | null;
  authMode: AuthMode;
  custodialState: CustodialState;
  isAuthenticating: boolean;
  sessionError: string | null;
  logIn: () => Promise<void>;
  logOut: () => Promise<void>;
  authenticate: () => Promise<void>;
  refreshSession: () => Promise<void>;
  requestCustodialLogin: (email: string) => Promise<{
    address: string;
    verificationToken: string;
    expiresAt: string;
    isNewUser: boolean;
  }>;
  completeCustodialLogin: (params: { email: string; token: string }) => Promise<void>;
}

const FlowWalletContext = createContext<FlowWalletContextValue | null>(null);

const toSnapshot = (user: unknown): FlowUserSnapshot | null => {
  if (!user || typeof user !== "object") {
    return null;
  }

  const candidate = user as { addr?: string | null; loggedIn?: boolean; expiresAt?: string };
  const addr = typeof candidate.addr === "string" ? candidate.addr : null;
  const loggedIn = Boolean(candidate.loggedIn);
  const expiresAt = typeof candidate.expiresAt === "string" ? candidate.expiresAt : null;
  return {
    addr,
    loggedIn,
    expiresAt,
    services: (candidate as { services?: Array<Record<string, unknown>> }).services,
  };
};

interface SessionState {
  token: string | null;
  roles: string[];
  expiresAt: string | null;
}

const STORAGE_KEY = "flow.session";

const readStoredSession = (): { address: string; token: string; expiresAt: string | null } | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as {
      address?: string;
      token?: string;
      expiresAt?: string | null;
    };
    if (!parsed || typeof parsed.address !== "string" || typeof parsed.token !== "string") {
      return null;
    }
    return {
      address: parsed.address,
      token: parsed.token,
      expiresAt: typeof parsed.expiresAt === "string" ? parsed.expiresAt : null,
    };
  } catch {
    return null;
  }
};

const writeStoredSession = (payload: { address: string; token: string; expiresAt: string | null }) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

const clearStoredSession = () => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
};

export const FlowWalletProvider = ({ children }: { children: ReactNode }) => {
  const [walletUser, setWalletUser] = useState<FlowUserSnapshot | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [session, setSession] = useState<SessionState>({
    token: null,
    roles: [],
    expiresAt: null,
  });
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isAuthenticating, setAuthenticating] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("wallet");
  const [custodialState, setCustodialState] = useState<CustodialState>({
    email: null,
    address: null,
    verificationToken: null,
    expiresAt: null,
  });
  const flowConfig = useMemo(() => resolveFlowConfig(), []);

  useEffect(() => {
    initFlowConfig();

    const unsubscribe = fcl.currentUser().subscribe((currentUser: unknown) => {
      setWalletUser(toSnapshot(currentUser));
      setIsReady(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const logIn = useCallback(async () => {
    setAuthMode("wallet");
    // Use fcl.authenticate() instead of fcl.logIn() for better compatibility
    await fcl.authenticate();
  }, []);

  const resetSession = useCallback(() => {
    setSession({ token: null, roles: [], expiresAt: null });
    setSessionToken(null);
    clearStoredSession();
  }, []);

  const syncSessionInfo = useCallback(
    (info: FlowSessionInfo, token: string) => {
      setSession({
        token,
        roles: info.roles,
        expiresAt: info.expiresAt,
      });
      setSessionToken(token);
      writeStoredSession({ address: info.address, token, expiresAt: info.expiresAt });
    },
    []
  );

  const establishWalletSession = useCallback(async () => {
    if (!walletUser?.loggedIn || !walletUser.addr) {
      resetSession();
      return;
    }

    const address = walletUser.addr.toLowerCase();
    setAuthenticating(true);
    setSessionError(null);

    try {
      const cached = readStoredSession();
      if (cached && cached.address.toLowerCase() === address) {
        setSessionToken(cached.token);
        try {
          const current = await fetchCurrentSession({
            token: cached.token,
            allowApiTokenFallback: false,
          });
          syncSessionInfo(current, cached.token);
          setAuthenticating(false);
          return;
        } catch {
          resetSession();
        }
      }

      const challenge = await requestFlowChallenge(walletUser.addr);
      const signatures = await fcl.currentUser().signUserMessage(challenge.nonce);
      
      // Check if user cancelled the signature request
      if (!signatures || (Array.isArray(signatures) && signatures.length === 0)) {
        resetSession();
        await fcl.unauthenticate(); // Clear FCL state to prevent re-triggering
        setSessionError("Authentication cancelled. Please try connecting your wallet again.");
        setAuthenticating(false);
        return;
      }
      
      const verified = await verifyFlowSignature({
        address: walletUser.addr,
        nonce: challenge.nonce,
        signatures,
      });

      syncSessionInfo(
        {
          address: walletUser.addr,
          roles: verified.roles,
          expiresAt: verified.expiresAt,
        },
        verified.token
      );
    } catch (error) {
      resetSession();
      
      // User-friendly error messages
      let message = "Failed to verify Flow session";
      let shouldUnauthenticate = false;
      
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();
        
        // User cancelled wallet action
        if (errorMsg.includes("declined") || errorMsg.includes("rejected") || errorMsg.includes("cancelled")) {
          message = "Authentication cancelled. Please try connecting your wallet again.";
          shouldUnauthenticate = true;
        }
        // Signature validation failed
        else if (errorMsg.includes("signatures are required") || errorMsg.includes("signature")) {
          message = "Authentication cancelled. Please approve the signature request in your wallet.";
          shouldUnauthenticate = true;
        }
        // Generic API errors
        else if (errorMsg.includes("api 400") || errorMsg.includes("bad request")) {
          message = "Authentication failed. Please try again.";
          shouldUnauthenticate = true;
        }
        // Keep original message for other errors
        else {
          message = error.message;
        }
      }
      
      // Clear FCL state to prevent automatic re-authentication
      if (shouldUnauthenticate) {
        await fcl.unauthenticate();
      }
      
      setSessionError(message);
    } finally {
      setAuthenticating(false);
    }
  }, [resetSession, syncSessionInfo, walletUser]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (authMode === "custodial") {
      if (!custodialState.address || !session.token) {
        return;
      }
      return;
    }

    if (!walletUser?.loggedIn || !walletUser.addr) {
      resetSession();
      return;
    }

    establishWalletSession();
  }, [
    authMode,
    custodialState.address,
    establishWalletSession,
    isReady,
    resetSession,
    session.token,
    walletUser,
  ]);

  const logOut = useCallback(async () => {
    try {
      if (session.token) {
        await logoutSession({ token: session.token, allowApiTokenFallback: false });
      }
    } catch (error) {
      console.warn("Failed to terminate Flow session", error);
    } finally {
      resetSession();
      setCustodialState({ email: null, address: null, verificationToken: null, expiresAt: null });
      setAuthMode("wallet");
      await fcl.unauthenticate();
    }
  }, [resetSession, session.token]);

  const authenticate = useCallback(async () => {
    await fcl.authenticate();
  }, []);

  const refreshSession = useCallback(async () => {
    if (!session.token) {
      return;
    }

    setAuthenticating(true);
    setSessionError(null);

    try {
      const current = await fetchCurrentSession({
        token: session.token,
        allowApiTokenFallback: false,
      });
      syncSessionInfo(current, session.token);
    } catch (error) {
      resetSession();
      const message =
        error instanceof Error ? error.message : "Failed to refresh Flow session";
      setSessionError(message);
    } finally {
      setAuthenticating(false);
    }
  }, [resetSession, session.token, syncSessionInfo]);

  const requestCustodial = useCallback(
    async (email: string) => {
      const response = await requestCustodialLogin(email);
      setCustodialState({
        email,
        address: response.address,
        verificationToken: response.verificationToken,
        expiresAt: response.expiresAt,
      });
      setAuthMode("custodial");
      return response;
    },
    []
  );

  const completeCustodialLogin = useCallback(
    async ({ email, token }: { email: string; token: string }) => {
      const result = await verifyCustodialLogin({ email, token });
      syncSessionInfo(
        {
          address: result.address,
          roles: result.roles,
          expiresAt: result.expiresAt,
        },
        result.token
      );
      setCustodialState({
        email,
        address: result.address,
        verificationToken: null,
        expiresAt: result.expiresAt,
      });
      setAuthMode("custodial");
      setSessionError(null);
    },
    [syncSessionInfo]
  );

  const activeAddress = authMode === "custodial"
    ? custodialState.address ?? null
    : walletUser?.addr ?? null;

  const contextUser = useMemo<FlowUserSnapshot | null>(() => {
    if (authMode === "custodial") {
      if (!custodialState.address) {
        return null;
      }

      return {
        addr: custodialState.address,
        loggedIn: Boolean(session.token && custodialState.address),
        expiresAt: custodialState.expiresAt ?? null,
        services: [],
      };
    }

    return walletUser;
  }, [
    authMode,
    custodialState.address,
    custodialState.expiresAt,
    session.token,
    walletUser,
  ]);

  const value = useMemo<FlowWalletContextValue>(
    () => ({
      user: contextUser,
      addr: activeAddress ?? null,
      loggedIn: Boolean(session.token && activeAddress),
      isReady,
      network: flowConfig.network,
      sessionToken: session.token,
      sessionRoles: session.roles,
      sessionExpiresAt: session.expiresAt,
      authMode,
      custodialState,
      isAuthenticating,
      sessionError,
      logIn,
      logOut,
      authenticate,
      refreshSession,
      requestCustodialLogin: requestCustodial,
      completeCustodialLogin,
    }),
    [
      activeAddress,
      authenticate,
      authMode,
      completeCustodialLogin,
      contextUser,
      custodialState,
      flowConfig.network,
      isReady,
      isAuthenticating,
      logIn,
      logOut,
      refreshSession,
      requestCustodial,
      session,
      sessionError,
    ]
  );

  return <FlowWalletContext.Provider value={value}>{children}</FlowWalletContext.Provider>;
};

export const useFlowWallet = (): FlowWalletContextValue => {
  const context = useContext(FlowWalletContext);
  if (!context) {
    throw new Error("useFlowWallet must be used within FlowWalletProvider");
  }
  return context;
};
