import Link from "next/link";

import { fetchMarkets } from "../lib/markets-api";
import { MarketsExplorer } from "../components/markets-explorer";

export const revalidate = 15;
export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  let markets: Awaited<ReturnType<typeof fetchMarkets>> = [];
  let loadFailed = false;

  try {
    markets = await fetchMarkets();
  } catch (error) {
    console.error("Failed to fetch markets list", error);
    loadFailed = true;
  }

  return (
    <main className="markets-page">
      <header className="markets-page__header">
        <div>
          <p className="eyebrow">Werpool marketplace</p>
          <h1>Discover outcomes worth trading</h1>
          <p className="lead">
            Browse the latest prediction markets, track liquidity, and jump straight into the action with Flow-native settlement.
          </p>
        </div>
        <div className="markets-page__actions">
          <Link className="button tertiary" href="/">
            Back home
          </Link>
          <Link className="button primary" href="/markets/create">
            Launch market
          </Link>
        </div>
      </header>

      {loadFailed ? (
        <section className="markets-page__content">
          <p className="muted">We could not load markets right now. Please try again in a moment.</p>
        </section>
      ) : (
        <MarketsExplorer markets={markets} />
      )}
    </main>
  );
}
