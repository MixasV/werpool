"use client";

import { useMemo, useState, FormEvent } from "react";

import {
  type UserProfile,
  updateMyProfile,
  updateMyPrivacy,
  requestEmailVerification,
  verifyEmail,
  type ProfileVisibility,
  type TradeHistoryVisibility,
} from "../lib/users-api";
import {
  fetchMyRolePurchaseRequests,
  requestRolePurchase,
  type RolePurchaseRequest,
} from "../lib/roles-api";

interface ProfileSettingsClientProps {
  initialProfile: UserProfile;
  initialPoints: number;
  initialRolePurchases: RolePurchaseRequest[];
}

interface BadgeDescriptor {
  id: string;
  label: string;
  description: string;
  tone: "gold" | "purple" | "blue" | "gray";
}

const profileVisibilityOptions: Array<{ value: ProfileVisibility; label: string }> = [
  { value: "public", label: "Public" },
  { value: "network", label: "Members only" },
  { value: "private", label: "Only me" },
];

const tradeHistoryOptions: Array<{ value: TradeHistoryVisibility; label: string }> = [
  { value: "public", label: "Public" },
  { value: "network", label: "Members only" },
  { value: "private", label: "Hidden" },
];

const roleLabels: Record<UserProfile["roles"][number]["role"], string> = {
  admin: "Admin",
  operator: "Operator",
  oracle: "Oracle",
  patrol: "Patrol",
};

const computeBadges = (points: number, roles: UserProfile["roles"]): BadgeDescriptor[] => {
  const badges: BadgeDescriptor[] = [];

  if (points >= 1500) {
    badges.push({ id: "legend", label: "Market legend", description: "Earned 1,500+ points", tone: "gold" });
  } else if (points >= 750) {
    badges.push({ id: "champion", label: "Champion", description: "Earned 750+ points", tone: "purple" });
  } else if (points >= 250) {
    badges.push({ id: "rising", label: "Rising star", description: "Earned 250+ points", tone: "blue" });
  } else if (points > 0) {
    badges.push({ id: "rookie", label: "Participant", description: "First steps on Werpool", tone: "gray" });
  }

  for (const role of roles) {
    if (role.role === "admin") {
      badges.push({ id: "admin", label: "Admin", description: "Extended controls", tone: "gold" });
    } else if (role.role === "operator") {
      badges.push({ id: "operator", label: "Operator", description: "Market operations", tone: "purple" });
    } else if (role.role === "oracle") {
      badges.push({ id: "oracle", label: "Oracle", description: "Data steward", tone: "blue" });
    } else if (role.role === "patrol") {
      badges.push({ id: "patrol", label: "Patrol", description: "Signal moderation", tone: "gray" });
    }
  }

  return badges;
};

const rolePurchaseStatusLabels: Record<RolePurchaseRequest["status"], string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DECLINED: "Declined",
  COMPLETED: "Completed",
};

export const ProfileSettingsClient = ({
  initialProfile,
  initialPoints,
  initialRolePurchases,
}: ProfileSettingsClientProps) => {
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const [label, setLabel] = useState(initialProfile.label ?? "");
  const [bio, setBio] = useState(initialProfile.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatarUrl ?? "");
  const [marketingOptIn, setMarketingOptIn] = useState(initialProfile.marketingOptIn);
  const [email, setEmail] = useState(initialProfile.email ?? "");
  const [emailTokenInput, setEmailTokenInput] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailToken, setEmailToken] = useState<string | null>(
    initialProfile.pendingEmailVerification ? "" : null
  );
  const [currentPoints, setCurrentPoints] = useState(initialPoints);
  const [roleRequests, setRoleRequests] = useState<RolePurchaseRequest[]>(initialRolePurchases);
  const [isRoleActionPending, setRoleActionPending] = useState(false);

  const badges = useMemo(() => computeBadges(currentPoints, profile.roles), [currentPoints, profile.roles]);
  const hasPatrolRole = useMemo(
    () => profile.roles.some((assignment) => assignment.role === "patrol"),
    [profile.roles]
  );
  const hasActivePatrolRequest = useMemo(
    () =>
      roleRequests.some(
        (request) => request.status === "PENDING" || request.status === "APPROVED"
      ),
    [roleRequests]
  );
  const canRequestPatrol = currentPoints >= 20000 && !hasPatrolRole && !hasActivePatrolRequest;

  const resetMessages = () => {
    setStatus(null);
    setError(null);
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessages();
    setPending(true);
    try {
      const payload = {
        label: label.trim() || null,
        bio: bio.trim() || null,
        avatarUrl: avatarUrl.trim() || null,
        marketingOptIn,
        email: email.trim() || null,
      } satisfies Parameters<typeof updateMyProfile>[0];

      const result = await updateMyProfile(payload);
      setProfile(result.profile);
      if (result.profile.email) {
        setEmail(result.profile.email);
      }
      if (result.verificationToken) {
        setEmailToken(result.verificationToken);
        setEmailTokenInput(result.verificationToken);
      }
      setStatus("Profile updated");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update profile";
      setError(message);
    } finally {
      setPending(false);
    }
  };

  const handlePrivacyChange = async (
    field: "profileVisibility" | "tradeHistoryVisibility",
    value: ProfileVisibility | TradeHistoryVisibility
  ) => {
    resetMessages();
    setPending(true);
    try {
      const payload = { [field]: value } as Parameters<typeof updateMyPrivacy>[0];
      const updated = await updateMyPrivacy(payload);
      setProfile(updated);
      setStatus("Privacy preferences saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      setError(message);
    } finally {
      setPending(false);
    }
  };

  const handleRequestPatrol = async () => {
    resetMessages();
    if (hasPatrolRole) {
      setError("PATROL role already assigned");
      return;
    }
    if (hasActivePatrolRequest) {
      setError("Existing PATROL request is still in progress");
      return;
    }
    if (currentPoints < 20000) {
      setError("You need at least 20,000 points");
      return;
    }

    setRoleActionPending(true);
    try {
      const request = await requestRolePurchase();
      setRoleRequests((prev) => [request, ...prev]);
      setCurrentPoints((value) => Math.max(0, value - 20000));
      setStatus("PATROL role request submitted");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not submit PATROL role request";
      setError(message);
    } finally {
      setRoleActionPending(false);
    }
  };

  const handleRefreshRoleRequests = async () => {
    resetMessages();
    setRoleActionPending(true);
    try {
      const requests = await fetchMyRolePurchaseRequests();
      setRoleRequests(requests);
      setStatus("Role purchase requests refreshed");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not refresh role purchase requests";
      setError(message);
    } finally {
      setRoleActionPending(false);
    }
  };

  const handleRequestEmailVerification = async () => {
    resetMessages();
    if (!email.trim()) {
      setError("Enter an email to verify");
      return;
    }
    setPending(true);
    try {
      const result = await requestEmailVerification();
      setEmailToken(result.verificationToken);
      setEmailTokenInput(result.verificationToken);
      setStatus(`Verification code sent. Expires: ${new Date(result.expiresAt).toLocaleString("en-US")}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not send verification code";
      setError(message);
    } finally {
      setPending(false);
    }
  };

  const handleVerifyEmail = async () => {
    const token = emailTokenInput.trim();
    if (!token) {
      setError("Enter the verification token");
      return;
    }
    resetMessages();
    setPending(true);
    try {
      const updated = await verifyEmail(token);
      setProfile(updated);
      setEmail(updated.email ?? "");
      setEmailToken(null);
      setStatus("Email verified");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid token";
      setError(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="profile-page__content">
      <section className="profile-section" aria-labelledby="profile-data">
        <div className="profile-section__header">
          <h2 id="profile-data">Profile basics</h2>
          <p>This information appears publicly based on your privacy settings.</p>
        </div>
        <form className="profile-form" onSubmit={handleProfileSubmit}>
          <div className="profile-form__grid">
            <label>
              Display name
              <input
                type="text"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                maxLength={64}
                placeholder="For example, WerpoolPro"
              />
            </label>
            <label>
              Email for updates
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
              />
            </label>
            <label className="profile-form__fullwidth">
              Bio
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                rows={4}
                maxLength={512}
                placeholder="Tell the community about your edge"
              />
            </label>
            <label>
              Avatar (URL)
              <input
                type="url"
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://example.com/avatar.png"
              />
            </label>
            <label className="profile-form__checkbox">
              <input
                type="checkbox"
                checked={marketingOptIn}
                onChange={(event) => setMarketingOptIn(event.target.checked)}
              />
              Send me emails about new markets
            </label>
          </div>
          <div className="profile-form__actions">
            <button type="submit" className="button" disabled={pending}>
              Save changes
            </button>
            {profile.pendingEmailVerification && (
              <button
                type="button"
                className="button secondary"
                onClick={handleRequestEmailVerification}
                disabled={pending}
              >
                Resend code
              </button>
            )}
          </div>
        </form>
        {profile.pendingEmailVerification && (
          <div className="profile-email-verification">
            <h3>Email verification</h3>
            <p>
              Enter the verification code. In dev mode the token is displayed here for convenience.
            </p>
            {emailToken !== null && (
              <div className="profile-email-verification__token">
                <span>Code:</span>
                <code>{emailToken || "—"}</code>
              </div>
            )}
            <div className="profile-email-verification__form">
              <input
                type="text"
                value={emailTokenInput}
                onChange={(event) => setEmailTokenInput(event.target.value)}
                placeholder="Enter code"
              />
              <button type="button" className="button" onClick={handleVerifyEmail} disabled={pending}>
                Confirm
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="profile-section" aria-labelledby="privacy-settings">
        <div className="profile-section__header">
          <h2 id="privacy-settings">Privacy</h2>
          <p>Decide who can view your profile and trade history.</p>
        </div>
        <div className="profile-privacy">
          <label>
            Profile visibility
            <select
              value={profile.profileVisibility}
              onChange={(event) =>
                handlePrivacyChange("profileVisibility", event.target.value as ProfileVisibility)
              }
              disabled={pending}
            >
              {profileVisibilityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Trade history
            <select
              value={profile.tradeHistoryVisibility}
              onChange={(event) =>
                handlePrivacyChange(
                  "tradeHistoryVisibility",
                  event.target.value as TradeHistoryVisibility
                )
              }
              disabled={pending}
            >
              {tradeHistoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="profile-section" aria-labelledby="roles">
        <div className="profile-section__header">
          <h2 id="roles">Roles & badges</h2>
          <p>Roles unlock advanced controls and badges help you stand out on the leaderboard.</p>
        </div>
        <div className="profile-roles">
          <div className="profile-roles__list">
            {profile.roles.length === 0 ? (
              <p className="profile-muted">No roles assigned yet</p>
            ) : (
              <ul>
                {profile.roles.map((role) => (
                  <li key={role.id}>
                    <span>{roleLabels[role.role]}</span>
                    <time dateTime={role.createdAt}>
                      {new Date(role.createdAt).toLocaleDateString("en-US")}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="profile-badges">
            {badges.length === 0 ? (
              <p className="profile-muted">Stack more points to unlock your first badges.</p>
            ) : (
              <ul>
                {badges.map((badge) => (
                  <li key={badge.id} className={`badge badge--${badge.tone}`}>
                    <span className="badge__label">{badge.label}</span>
                    <span className="badge__description">{badge.description}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="profile-section" aria-labelledby="patrol-role">
        <div className="profile-section__header">
          <h2 id="patrol-role">Unlock PATROL role</h2>
          <p>Spend 20,000 points to submit a PATROL role request. Admins review requests before approval.</p>
        </div>
        <div className="profile-role-purchase">
          <div className="profile-role-purchase__actions">
            <p className="profile-muted">
              Available points: {currentPoints.toLocaleString("en-US")} · Cost: 20,000 points
            </p>
            <div className="profile-role-purchase__buttons">
              <button
                type="button"
                className="button"
                onClick={handleRequestPatrol}
                disabled={!canRequestPatrol || isRoleActionPending || pending}
              >
                {isRoleActionPending ? "Working…" : "Request PATROL role"}
              </button>
              <button
                type="button"
                className="button tertiary"
                onClick={handleRefreshRoleRequests}
                disabled={isRoleActionPending}
              >
                Refresh status
              </button>
            </div>
            {hasActivePatrolRequest && (
              <p className="profile-muted">A PATROL request is currently awaiting review.</p>
            )}
            {hasPatrolRole && <p className="profile-muted">PATROL role already granted.</p>}
          </div>
          <div className="profile-role-purchase__history">
            <h3>Request history</h3>
            {roleRequests.length === 0 ? (
              <p className="profile-muted">No PATROL requests yet.</p>
            ) : (
              <ul>
                {roleRequests.map((request) => (
                  <li key={request.id}>
                    <div className="profile-role-purchase__item">
                      <span className="profile-role-purchase__status">
                        {rolePurchaseStatusLabels[request.status]}
                      </span>
                      <time dateTime={request.createdAt}>
                        {new Date(request.createdAt).toLocaleString("en-US")}
                      </time>
                    </div>
                    <p className="profile-muted">
                      Spent {request.pointsSpent.toLocaleString("en-US")} points
                    </p>
                    {request.notes && <p className="profile-note">{request.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {status && <div className="profile-status profile-status--success">{status}</div>}
      {error && <div className="profile-status profile-status--error">{error}</div>}
    </div>
  );
};
