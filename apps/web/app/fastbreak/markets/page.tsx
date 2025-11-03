import Link from "next/link";

import { fetchFastBreakMarkets } from "../../lib/fastbreak-api";
import { MarketsExplorer } from "../../components/markets-explorer";

export const revalidate = 15;
export const dynamic = "force-dynamic";

export default async function FastBreakMarketsPage() {
  let markets: Awaited<ReturnType<typeof fetchFastBreakMarkets>> = [];
  let loadFailed = false;

  try {
    markets = await fetchFastBreakMarkets();
  } catch (error) {
    console.error("Failed to fetch FastBreak markets", error);
    loadFailed = true;
  }

  return (
    <main className="markets-page">
      <header className="markets-page__header">
        <div>
          <p className="eyebrow">NBA TopShot FastBreak</p>
          <h1>FastBreak Prediction Markets</h1>
          <p className="lead">
            Predict who will win FastBreak Runs. Markets are automatically created for active Runs 
            and settled via TopShot API when competitions complete.
          </p>
        </div>
        <div className="markets-page__actions">
          <Link className="button tertiary" href="/fastbreak/challenges">
            View challenges
          </Link>
          <Link className="button primary" href="/markets">
            All markets
          </Link>
        </div>
      </header>

      {loadFailed ? (
        <section className="markets-page__content">
          <p className="muted">Could not load FastBreak markets right now. Please try again.</p>
        </section>
      ) : markets.length === 0 ? (
        <section className="markets-page__content">
          <div className="empty-state">
            <h2>No active FastBreak markets</h2>
            <p className="muted">
              Markets are automatically created when new FastBreak Runs start on NBA TopShot.
              Check back soon or explore other prediction markets.
            </p>
            <Link className="button primary" href="/markets">
              Browse all markets
            </Link>
          </div>
        </section>
      ) : (
        <MarketsExplorer markets={markets} />
      )}
    </main>
  );
}
