export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL ?? "http://localhost:3333";

export interface AuthOptions {
  token?: string | null;
  allowApiTokenFallback?: boolean;
}

let clientSessionToken: string | null = null;

export const setSessionToken = (token: string | null): void => {
  clientSessionToken = token ?? null;
};

const getClientSessionToken = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  return clientSessionToken;
};

const getServerSessionToken = (): string | null => {
  if (typeof window !== "undefined") {
    return null;
  }

  try {
    // eslint-disable-next-line global-require
    const { cookies } = require("next/headers") as typeof import("next/headers");
    const store = cookies();
    const cookieName = process.env.NEXT_PUBLIC_FLOW_SESSION_COOKIE ?? "flow_session";
    return store.get(cookieName)?.value ?? null;
  } catch {
    return null;
  }
};

const getFallbackApiToken = (): string | null => {
  if (typeof window === "undefined") {
    return process.env.API_ACCESS_TOKEN ?? process.env.NEXT_PUBLIC_API_TOKEN ?? null;
  }
  return process.env.NEXT_PUBLIC_API_TOKEN ?? null;
};

export const withAuthHeaders = (
  init: RequestInit = {},
  options: AuthOptions = {}
): RequestInit => {
  const headers = new Headers(init.headers);
  const sessionToken =
    options.token ?? getClientSessionToken() ?? getServerSessionToken();

  if (sessionToken) {
    headers.set("authorization", `Bearer ${sessionToken}`);
  } else if (options.allowApiTokenFallback !== false) {
    const fallback = getFallbackApiToken();
    if (fallback) {
      headers.set("x-api-token", fallback);
    }
  }

  return {
    ...init,
    headers,
  };
};

export const parseJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const reason = await response.text();
    throw new Error(`API ${response.status}: ${reason}`);
  }

  return (await response.json()) as T;
};

export const DEFAULT_HEADERS: HeadersInit = {
  accept: "application/json",
};
