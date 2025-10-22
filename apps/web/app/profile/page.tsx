import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { fetchMyProfile } from "../lib/users-api";
import { fetchMyPointsSummary } from "../lib/points-api";
import { ProfileSettingsClient } from "./profile-settings-client";
import { fetchMyRolePurchaseRequests } from "../lib/roles-api";
import { TopShotRewardsSection } from "./topshot-rewards-section";
import { RolePurchaseSection } from "./role-purchase-section";

export const dynamic = "force-dynamic";

const getProfile = cache(() => fetchMyProfile({ allowApiTokenFallback: false }));
const getPointsSummary = cache(() => fetchMyPointsSummary({ allowApiTokenFallback: false }));
const getRolePurchases = cache(() => fetchMyRolePurchaseRequests({ allowApiTokenFallback: false }));

const sessionCookieName = process.env.NEXT_PUBLIC_FLOW_SESSION_COOKIE ?? "flow_session";

export default async function ProfilePage() {
  const store = cookies();
  const token = store.get(sessionCookieName)?.value ?? null;

  if (!token) {
    redirect("/markets");
  }

  const [profile, points, rolePurchases] = await Promise.all([
    getProfile(),
    getPointsSummary(),
    getRolePurchases(),
  ]);

  return (
    <div className="profile-page">
      <section className="profile-page__hero">
        <div className="profile-page__intro">
          <h1>My Werpool profile</h1>
          <p>
            Manage your public presence, email alerts, and privacy preferences for the Werpool prediction network.
          </p>
        </div>
        <div className="profile-page__stats">
          <div className="profile-card">
            <span className="profile-card__label">Total points</span>
            <span className="profile-card__value">{points.total.toLocaleString("en-US")}</span>
            <span className="profile-card__hint">Updated: {new Date(points.updatedAt).toLocaleString("en-US")}</span>
          </div>
          <div className="profile-card profile-card--compact">
            <span className="profile-card__label">Address</span>
            <code className="profile-card__code">{profile.address}</code>
          </div>
        </div>
      </section>

      <ProfileSettingsClient
        initialProfile={profile}
        initialPoints={points.total}
        initialRolePurchases={rolePurchases}
      />
    </div>
  );
}
