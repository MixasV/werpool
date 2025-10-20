import { API_BASE_URL, parseJson, withAuthHeaders, type AuthOptions } from "./api-client";

export type ProfileVisibility = "public" | "private" | "network";
export type TradeHistoryVisibility = "public" | "private" | "network";

export interface UserRole {
  id: string;
  role: "admin" | "operator" | "oracle" | "patrol";
  createdAt: string;
}

export interface UserProfile {
  address: string;
  label: string | null;
  bio: string | null;
  avatarUrl: string | null;
  email: string | null;
  emailVerifiedAt: string | null;
  marketingOptIn: boolean;
  profileVisibility: ProfileVisibility;
  tradeHistoryVisibility: TradeHistoryVisibility;
  firstSeenAt: string;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: UserRole[];
  pendingEmailVerification: boolean;
}

export interface UpdateProfilePayload {
  label?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  marketingOptIn?: boolean;
  email?: string | null;
}

export interface UpdatePrivacyPayload {
  profileVisibility?: ProfileVisibility;
  tradeHistoryVisibility?: TradeHistoryVisibility;
}

interface UpdateProfileResponse {
  profile: UserProfile;
  verificationToken?: string;
}

export const fetchMyProfile = async (options?: AuthOptions): Promise<UserProfile> => {
  const response = await fetch(
    `${API_BASE_URL}/users/me`,
    withAuthHeaders({}, options)
  );
  return parseJson<UserProfile>(response);
};

export const fetchProfileByAddress = async (
  address: string,
  options?: AuthOptions
): Promise<UserProfile> => {
  const response = await fetch(
    `${API_BASE_URL}/users/${encodeURIComponent(address)}`,
    withAuthHeaders({}, options)
  );
  return parseJson<UserProfile>(response);
};

export const updateMyProfile = async (
  payload: UpdateProfilePayload,
  options?: AuthOptions
): Promise<UpdateProfileResponse> => {
  const response = await fetch(
    `${API_BASE_URL}/users/me`,
    withAuthHeaders(
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      options
    )
  );
  return parseJson<UpdateProfileResponse>(response);
};

export const updateMyPrivacy = async (
  payload: UpdatePrivacyPayload,
  options?: AuthOptions
): Promise<UserProfile> => {
  const response = await fetch(
    `${API_BASE_URL}/users/me/privacy`,
    withAuthHeaders(
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      options
    )
  );
  return parseJson<UserProfile>(response);
};

export const requestEmailVerification = async (
  options?: AuthOptions
): Promise<{ verificationToken: string; expiresAt: string }> => {
  const response = await fetch(
    `${API_BASE_URL}/users/me/email/request`,
    withAuthHeaders(
      {
        method: "POST",
      },
      options
    )
  );
  return parseJson<{ verificationToken: string; expiresAt: string }>(response);
};

export const verifyEmail = async (
  token: string,
  options?: AuthOptions
): Promise<UserProfile> => {
  const response = await fetch(
    `${API_BASE_URL}/users/me/email/verify`,
    withAuthHeaders(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      },
      options
    )
  );
  return parseJson<UserProfile>(response);
};
