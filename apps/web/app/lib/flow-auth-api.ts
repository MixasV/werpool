import { API_BASE_URL, parseJson, setSessionToken, type AuthOptions, withAuthHeaders } from "./api-client";

export interface CompositeSignature {
  addr: string;
  keyId: number;
  signature: string;
}

export interface FlowChallengeResponse {
  address: string;
  nonce: string;
  expiresAt: string;
}

export interface FlowVerifyResponse {
  token: string;
  address: string;
  roles: string[];
  expiresAt: string;
}

export interface FlowSessionInfo {
  address: string;
  roles: string[];
  expiresAt: string;
}

export interface CustodialRequestResponse {
  address: string;
  verificationToken: string;
  expiresAt: string;
  isNewUser: boolean;
}

export interface CustodialVerifyResponse {
  token: string;
  address: string;
  roles: string[];
  expiresAt: string;
  isNewUser: boolean;
}

export const requestFlowChallenge = async (
  address: string
): Promise<FlowChallengeResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/flow/challenge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ address }),
    credentials: "include",
  });

  return parseJson<FlowChallengeResponse>(response);
};

export const verifyFlowSignature = async (payload: {
  address: string;
  nonce: string;
  signatures: CompositeSignature[];
}): Promise<FlowVerifyResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/flow/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    credentials: "include",
  });

  const result = await parseJson<FlowVerifyResponse>(response);
  setSessionToken(result.token);
  return result;
};

export const fetchCurrentSession = async (
  auth?: AuthOptions
): Promise<FlowSessionInfo> => {
  const response = await fetch(
    `${API_BASE_URL}/auth/flow/me`,
    withAuthHeaders({ cache: "no-store", credentials: "include" }, auth)
  );

  return parseJson<FlowSessionInfo>(response);
};

export const logoutSession = async (auth?: AuthOptions): Promise<void> => {
  const response = await fetch(
    `${API_BASE_URL}/auth/flow/logout`,
    withAuthHeaders(
      {
        method: "POST",
        credentials: "include",
      },
      auth
    )
  );

  if (!response.ok) {
    const reason = await response.text();
    throw new Error(`API ${response.status}: ${reason}`);
  }
  setSessionToken(null);
};

export const requestCustodialLogin = async (
  email: string
): Promise<CustodialRequestResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/custodial/request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
    credentials: "include",
  });

  return parseJson<CustodialRequestResponse>(response);
};

export const verifyCustodialLogin = async (payload: {
  email: string;
  token: string;
}): Promise<CustodialVerifyResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/custodial/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    credentials: "include",
  });

  const result = await parseJson<CustodialVerifyResponse>(response);
  setSessionToken(result.token);
  return result;
};
