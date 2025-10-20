import Link from 'next/link';

const primaryCta = {
  href: '/markets',
  label: 'Start forecasting',
};

const secondaryCta = {
  href: '/leaderboard',
  label: 'View leaderboard',
};

const featureHighlights = [
  {
    title: 'Collective wisdom, amplified',
    description: 'Follow social sentiment, share market insights, and crowdsource intelligence across global communities.',
  },
  {
    title: 'Flow speed and security',
    description: 'Trade outcomes with low fees, fast finality, and the safety of the Flow blockchain.',
  },
  {
    title: 'Designed for every intuition',
    description: 'Whether you track sports, politics, or crypto, Werpool keeps complex DeFi mechanics behind a friendly interface.',
  },
];

const credibilityPillars = [
  {
    title: 'Trade outcomes, not tickers',
    copy: 'Turn predictions into positions across events that matter. Create custom markets or join curated pools with a few clicks.',
  },
  {
    title: 'Transparent LMSR pricing',
    copy: 'See live probabilities, liquidity, and depth with rich charts. Every move is recorded on-chain for verifiable fairness.',
  },
  {
    title: 'Community-first experience',
    copy: 'Earn points, unlock badges, and build a signal streak that proves you saw the future before anyone else.',
  },
];

export default function Home() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">WERPOOL · Your forecast is your asset</p>
        <h1>Your intuition is the most valuable asset.</h1>
        <p className="lead">
          Werpool is the decentralized platform where you trade outcomes across sports, politics, and crypto at the speed of Flow. Create, buy, sell — and prove you were right.
        </p>
        <div className="cta-group">
          <Link className="button primary" href={primaryCta.href}>
            {primaryCta.label}
          </Link>
          <Link className="button secondary" href={secondaryCta.href}>
            {secondaryCta.label}
          </Link>
        </div>
      </section>

      <section className="features">
        <h2>Why the community gathers on Werpool</h2>
        <div className="features-grid">
          {featureHighlights.map((feature) => (
            <article key={feature.title} className="feature-card">
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about">
        <div className="about__content">
          <h2>Built around collective foresight</h2>
          <p>
            Werpool is founded on a simple idea: collective wisdom is the most powerful forecasting engine. Powered by Flow blockchain, we deliver a global arena where anyone can back their view of the future.
          </p>
          <p>
            Sports diehards, policy analysts, and Web3 explorers alike will find markets that matter. Automated oracle resolution, low fees, and an intuitive interface keep trading transparent and accessible for every participant.
          </p>
          <p>
            From everyday predictions to premium markets with NFT utilities, Werpool gives you a stake in the truth. Join the community that is shaping the future of prediction.
          </p>
        </div>
        <div className="about__grid">
          {credibilityPillars.map((pillar) => (
            <article key={pillar.title} className="about__card">
              <h3>{pillar.title}</h3>
              <p>{pillar.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-banner">
        <div>
          <h2>Ready to stake your insight?</h2>
          <p>Create a market, sync your Flow wallet, or follow live trades to turn intuition into assets.</p>
        </div>
        <Link className="button primary" href="/markets/create">
          Launch a market
        </Link>
      </section>
    </main>
  );
}
