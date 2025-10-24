import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { MarketDetailPanel } from "../../components/market-detail";
import { MarketForm } from "../../components/market-form";
import { MarketLiquidityPanel } from "../../components/market-liquidity-panel";
import { MarketPoolPanel } from "../../components/market-pool-panel";
import { MarketTradePanelWrapper } from "../../components/market-trade-panel-wrapper";
import { MarketTransactionLogPanel } from "../../components/market-transaction-log-panel";
import { MarketChartsPanel } from "../../components/market-charts-panel";
import {
  burnOutcomeTokens,
  createMarketPool,
  executeTrade,
  fetchMarket,
  fetchMarketPoolState,
  fetchMarketBalances,
  fetchMarketTrades,
  fetchMarketTransactions,
  mintOutcomeTokens,
  quoteTrade,
  updateMarket,
} from "../../lib/markets-api";
import { fetchMarketAnalytics } from "../../lib/market-analytics-api";
import { fetchCurrentSession } from "../../lib/flow-auth-api";

interface MarketPageParams {
  params: {
    slug: string;
  };
}

export const dynamic = "force-dynamic";

export default async function MarketDetailPage({ params }: MarketPageParams) {
  const { slug } = params;

  const sessionCookieName = process.env.NEXT_PUBLIC_FLOW_SESSION_COOKIE ?? "flow_session";
  
  // Get user roles for RBAC
  const token = cookies().get(sessionCookieName)?.value ?? null;
  let userRoles: string[] = [];
  try {
    if (token) {
      const session = await fetchCurrentSession({ token, allowApiTokenFallback: false });
      userRoles = session.roles;
    }
  } catch {
    // Not authenticated or session expired - no roles
    userRoles = [];
  }
  
  const isAdmin = userRoles.includes("admin");
  const isOperator = userRoles.includes("operator");
  const canEdit = isAdmin || isOperator;

  try {
    const market = await fetchMarket(slug);
    const marketId = market.id;
    const tradesLimit = 100;
    const transactionLimit = 100;
    let poolState: Awaited<ReturnType<typeof fetchMarketPoolState>> | null = null;
    let trades: Awaited<ReturnType<typeof fetchMarketTrades>> = [];
    let transactions: Awaited<ReturnType<typeof fetchMarketTransactions>> = [];
    let analyticsData: Awaited<ReturnType<typeof fetchMarketAnalytics>> = [];

    try {
      poolState = await fetchMarketPoolState(marketId);
    } catch (poolError) {
      const reason = poolError instanceof Error ? poolError.message : String(poolError ?? "");
      console.warn(`Failed to fetch pool state for ${marketId}: ${reason}`);
    }

    try {
      trades = await fetchMarketTrades(marketId, tradesLimit);
    } catch (tradeError) {
      const reason = tradeError instanceof Error ? tradeError.message : String(tradeError ?? "");
      console.warn(`Failed to fetch trade history for ${marketId}: ${reason}`);
      trades = [];
    }

    try {
      transactions = await fetchMarketTransactions(marketId, transactionLimit);
    } catch (transactionError) {
      const reason =
        transactionError instanceof Error ? transactionError.message : String(transactionError ?? "");
      console.warn(`Failed to fetch transaction log for ${marketId}: ${reason}`);
      transactions = [];
    }

    try {
      analyticsData = await fetchMarketAnalytics(marketId, {
        interval: 'hour',
        limit: 500,
      });
    } catch (analyticsError) {
      const reason =
        analyticsError instanceof Error ? analyticsError.message : String(analyticsError ?? "");
      console.warn(`Failed to fetch analytics for ${marketId}: ${reason}`);
      analyticsData = [];
    }

    const refreshPoolState = async (): Promise<Awaited<ReturnType<typeof fetchMarketPoolState>>> => {
      "use server";

      try {
        return await fetchMarketPoolState(marketId);
      } catch (error) {
        console.error(`Failed to refresh pool state for ${marketId}`, error);
        throw error;
      }
    };

    const quoteTradeAction = async (
      payload: Parameters<typeof quoteTrade>[1]
    ): Promise<Awaited<ReturnType<typeof quoteTrade>>> => {
      "use server";

      try {
        const token = cookies().get(sessionCookieName)?.value ?? null;
        return await quoteTrade(marketId, payload, {
          token,
          allowApiTokenFallback: false,
        });
      } catch (error) {
        console.error(`Failed to fetch quote for ${marketId}`, error);
        throw error;
      }
    };

    const executeTradeAction = async (
      payload: Parameters<typeof executeTrade>[1]
    ): Promise<Awaited<ReturnType<typeof executeTrade>>> => {
      "use server";

      try {
        const token = cookies().get(sessionCookieName)?.value ?? null;
        return await executeTrade(marketId, payload, {
          token,
          allowApiTokenFallback: false,
        });
      } catch (error) {
        console.error(`Failed to execute trade for ${marketId}`, error);
        throw error;
      }
    };

    const fetchBalancesAction = async (
      address: Parameters<typeof fetchMarketBalances>[1]
    ): Promise<Awaited<ReturnType<typeof fetchMarketBalances>>> => {
      "use server";

      try {
        return await fetchMarketBalances(marketId, address);
      } catch (error) {
        console.error(`Failed to fetch balances for ${marketId}`, error);
        throw error;
      }
    };

    const createPoolAction = async (
      payload: Parameters<typeof createMarketPool>[1]
    ): Promise<Awaited<ReturnType<typeof createMarketPool>>> => {
      "use server";

      try {
        const token = cookies().get(sessionCookieName)?.value ?? null;
        return await createMarketPool(marketId, payload, {
          token,
          allowApiTokenFallback: false,
        });
      } catch (error) {
        console.error(`Failed to create pool for ${marketId}`, error);
        throw error;
      }
    };

    const mintLiquidityAction = async (
      payload: Parameters<typeof mintOutcomeTokens>[1]
    ): Promise<Awaited<ReturnType<typeof mintOutcomeTokens>>> => {
      "use server";

      try {
        const token = cookies().get(sessionCookieName)?.value ?? null;
        return await mintOutcomeTokens(marketId, payload, {
          token,
          allowApiTokenFallback: false,
        });
      } catch (error) {
        console.error(`Failed to add liquidity for ${marketId}`, error);
        throw error;
      }
    };

    const burnLiquidityAction = async (
      payload: Parameters<typeof burnOutcomeTokens>[1]
    ): Promise<Awaited<ReturnType<typeof burnOutcomeTokens>>> => {
      "use server";

      try {
        const token = cookies().get(sessionCookieName)?.value ?? null;
        return await burnOutcomeTokens(marketId, payload, {
          token,
          allowApiTokenFallback: false,
        });
      } catch (error) {
        console.error(`Failed to remove liquidity for ${marketId}`, error);
        throw error;
      }
    };

    const handleUpdate = async (formData: FormData) => {
      "use server";

      const payloadRaw = formData.get("payload");
      if (typeof payloadRaw !== "string") {
        throw new Error("Could not read form payload");
      }

      const payload = JSON.parse(payloadRaw);
      const marketId = (formData.get("marketId") as string) ?? market.id;

      const token = cookies().get(sessionCookieName)?.value ?? null;
      const updated = await updateMarket(
        slug,
        { ...payload, id: marketId },
        {
          token,
          allowApiTokenFallback: false,
        }
      );
      redirect(`/markets/${updated.slug}`);
    };

    return (
      <main className="market-page">
        <header className="market-page__header">
          <Link className="button tertiary" href="/markets">
            ← Back
          </Link>
          <Link className="button secondary" href={`/markets/${market.slug}/analytics`}>
            Analytics
          </Link>
        </header>
        <MarketDetailPanel market={market} />

        <MarketChartsPanel
          marketId={marketId}
          outcomes={market.outcomes.map((o) => ({
            label: o.label,
            index: o.index ?? 0,
          }))}
          analyticsData={analyticsData}
        />

        <MarketTradePanelWrapper
          market={market}
          outcomes={market.outcomes}
          onQuote={quoteTradeAction}
          onExecute={executeTradeAction}
          fetchBalances={fetchBalancesAction}
          initialPoolState={poolState}
          refreshPool={refreshPoolState}
          marketSlug={market.slug}
          marketId={marketId}
          initialTrades={trades}
          tradesLimit={tradesLimit}
        />
        <MarketTransactionLogPanel
          marketId={marketId}
          marketSlug={market.slug}
          initialTransactions={transactions}
          limit={transactionLimit}
        />
        
        {/* RBAC: Only admin/operator can manage liquidity */}
        {canEdit && (
          <>
            <MarketLiquidityPanel
              marketSlug={market.slug}
              outcomes={market.outcomes}
              initialState={poolState}
              refreshPool={refreshPoolState}
              onCreatePool={createPoolAction}
              onMint={mintLiquidityAction}
              onBurn={burnLiquidityAction}
            />
            <MarketPoolPanel
              marketSlug={market.slug}
              initialState={poolState}
              refreshPool={refreshPoolState}
            />
            <section className="market-page__editor">
              <h2>Edit market</h2>
              <MarketForm
                action={handleUpdate}
                marketId={market.id}
                initial={market}
                submitLabel="Update market"
              />
            </section>
          </>
        )}
      </main>
    );
  } catch (error) {
    console.error(error);
    notFound();
  }
}
