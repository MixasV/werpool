import Link from "next/link";

export default function MarketNotFound() {
  return (
    <main className="market-page">
      <div className="market-page__empty">
        <h1>Market not found</h1>
        <p>The requested market is unavailable or has been removed.</p>
        <Link className="button secondary" href="/markets">
          Back to markets
        </Link>
      </div>
    </main>
  );
}
