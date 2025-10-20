import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createMarket } from "../../lib/markets-api";
import { MarketForm } from "../../components/market-form";

export const dynamic = "force-dynamic";

const sessionCookieName = process.env.NEXT_PUBLIC_FLOW_SESSION_COOKIE ?? "flow_session";

async function createMarketAction(formData: FormData) {
  "use server";

  const payload = JSON.parse(formData.get("payload") as string);
  const token = cookies().get(sessionCookieName)?.value ?? null;
  const market = await createMarket(payload, {
    token,
    allowApiTokenFallback: false,
  });
  redirect(`/markets/${market.slug}`);
}

export default function CreateMarketPage() {
  return (
    <main className="market-page">
      <header className="market-page__header">
        <h1>Create a new market</h1>
      </header>
      <MarketForm action={createMarketAction} submitLabel="Create market" />
    </main>
  );
}
