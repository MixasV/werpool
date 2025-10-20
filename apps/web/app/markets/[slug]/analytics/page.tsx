import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketAnalyticsPanel } from "../../../components/market-analytics-panel";
import {
  fetchMarket,
  fetchMarketAnalytics,
  type MarketAnalyticsPoint,
} from "../../../lib/markets-api";

interface MarketAnalyticsPageParams {
  params: {
    slug: string;
  };
}

export const dynamic = "force-dynamic";

export default async function MarketAnalyticsPage({ params }: MarketAnalyticsPageParams) {
  const { slug } = params;

  try {
    const market = await fetchMarket(slug);
    const defaultOutcomeIndex = 0;
    let snapshots: MarketAnalyticsPoint[] = [];

    try {
      snapshots = await fetchMarketAnalytics(market.id, {
        interval: "hour",
        outcomeIndex: defaultOutcomeIndex,
      });
    } catch (error) {
      console.error("Failed to load market analytics", error);
    }

    return (
      <main className="market-analytics-page">
        <header className="market-analytics-page__header">
          <Link className="button tertiary" href={`/markets/${market.slug}`}>
            ← Back to market details
          </Link>
          <h1>{market.title}</h1>
        </header>
        <MarketAnalyticsPanel
          marketId={market.id}
          marketSlug={market.slug}
          outcomes={market.outcomes}
          initialSnapshots={snapshots}
          initialOutcomeIndex={defaultOutcomeIndex}
        />
      </main>
    );
  } catch (error) {
    console.error(`Market ${slug} not found`, error);
    notFound();
  }
}
