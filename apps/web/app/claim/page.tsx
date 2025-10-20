import Link from "next/link";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  claimRewards,
  fetchMarket,
  fetchMarkets,
  type ClaimRewardsPayload,
  type MarketDetail,
} from "../lib/markets-api";
import { ClaimCenter, type ClaimActionResult } from "../components/claim-center";

export const dynamic = "force-dynamic";

export default async function ClaimPage() {
  const sessionCookieName = process.env.NEXT_PUBLIC_FLOW_SESSION_COOKIE ?? "flow_session";
  let settledMarkets: MarketDetail[] = [];
  let loadError: string | null = null;

  try {
    const markets = await fetchMarkets();
    const settled = markets.filter((market) => market.state === "settled");
    const details = await Promise.allSettled(
      settled.map((market) => fetchMarket(market.id))
    );

    settledMarkets = details
      .filter((entry): entry is PromiseFulfilledResult<MarketDetail> => entry.status === "fulfilled")
      .map((entry) => entry.value);
  } catch (error) {
    console.error("Failed to load claim center data", error);
    loadError = error instanceof Error ? error.message : "Unknown loading error";
  }

  const claimAction = async (formData: FormData): Promise<ClaimActionResult> => {
    "use server";

    const marketId = formData.get("marketId");
    const payloadRaw = formData.get("payload");
    const slug = formData.get("slug");

    if (typeof marketId !== "string" || typeof payloadRaw !== "string") {
      return { ok: false, error: "Invalid form data" };
    }

    let payload: ClaimRewardsPayload;
    try {
      payload = JSON.parse(payloadRaw) as ClaimRewardsPayload;
    } catch (error) {
      console.error("Failed to parse claim payload", error);
      return { ok: false, error: "Invalid payload format" };
    }

    try {
      const token = cookies().get(sessionCookieName)?.value ?? null;
      const result = await claimRewards(marketId, payload, {
        token,
        allowApiTokenFallback: false,
      });

      revalidatePath("/claim");
      if (typeof slug === "string" && slug.length > 0) {
        revalidatePath(`/markets/${slug}`);
      }

      return { ok: true, data: result } satisfies ClaimActionResult;
    } catch (error) {
      console.error(`Claim request failed for ${marketId}`, error);
      const message = error instanceof Error ? error.message : "Claim transaction failed";
      return { ok: false, error: message } satisfies ClaimActionResult;
    }
  };

  return (
    <main className="claim-page">
      <header className="claim-page__header">
        <div>
          <p className="eyebrow">Payouts</p>
          <h1>Claim Center</h1>
          <p className="lead">
            Manage your rewards for settled markets and dispatch claim transactions to the Flow
            network.
          </p>
        </div>
        <div className="claim-page__actions">
          <Link className="button tertiary" href="/markets">
            Go to Marketplace
          </Link>
          <Link className="button secondary" href="/">
            Back to Home
          </Link>
        </div>
      </header>

      {loadError && (
        <section className="claim-page__notice">
          <p className="error-text">{loadError}</p>
        </section>
      )}

      <ClaimCenter markets={settledMarkets} onClaim={claimAction} />
    </main>
  );
}
