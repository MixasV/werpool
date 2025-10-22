import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createMarket } from "../../lib/markets-api";
import { fetchCurrentSession } from "../../lib/flow-auth-api";
import { MarketForm } from "../../components/market-form";

export const dynamic = "force-dynamic";

const sessionCookieName = process.env.NEXT_PUBLIC_FLOW_SESSION_COOKIE ?? "flow_session";

async function createMarketAction(formData: FormData) {
  "use server";

  const payload = JSON.parse(formData.get("payload") as string);
  const token = cookies().get(sessionCookieName)?.value ?? null;
  if (!token) {
    throw new Error("Only administrators can create markets");
  }

  const session = await fetchCurrentSession({
    token,
    allowApiTokenFallback: false,
  });

  const hasAdminRole = Array.isArray(session.roles)
    ? session.roles.map((role) => role.toLowerCase()).includes("admin")
    : false;

  if (!hasAdminRole) {
    throw new Error("Only administrators can create markets");
  }

  const market = await createMarket(payload, {
    token,
    allowApiTokenFallback: false,
  });
  redirect(`/markets/${market.slug}`);
}

export default function CreateMarketPage() {
  return <ProtectedCreateMarketPage />;
}

async function ProtectedCreateMarketPage() {
  const token = cookies().get(sessionCookieName)?.value ?? null;

  if (!token) {
    redirect("/markets");
  }

  try {
    const session = await fetchCurrentSession({
      token,
      allowApiTokenFallback: false,
    });
    const hasAdminRole = Array.isArray(session.roles)
      ? session.roles.map((role) => role.toLowerCase()).includes("admin")
      : false;

    if (!hasAdminRole) {
      redirect("/markets");
    }
  } catch (error) {
    console.warn("Create market access denied", error);
    redirect("/markets");
  }

  return (
    <main className="market-page">
      <header className="market-page__header">
        <h1>Create a new market</h1>
      </header>
      <MarketForm action={createMarketAction} submitLabel="Create market" />
    </main>
  );
}
