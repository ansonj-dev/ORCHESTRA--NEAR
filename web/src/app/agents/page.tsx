import type { Metadata } from 'next';
import Link from 'next/link';
import catalog from '../../../public/agents/catalog.json';

export const metadata: Metadata = {
  title: 'Agent packages',
  description: 'Explore the agent implementations included in the Orchestra repository and publish one on NEAR testnet.',
};

export default function AgentsPage() {
  return (
    <main className="editorial-page">
      <div className="editorial-shell">
        <header className="editorial-hero" data-reveal="up">
          <span className="section-kicker">ORCHESTRA · AGENT LIBRARY</span>
          <h1>AGENTS BUILT<br />TO DO A JOB.</h1>
          <p>These starter agents are versioned in the repository and loaded by the provider adapter. Each package has its own execution instructions. Publish from your provider account to make a real service listing appear in the NEAR testnet marketplace.</p>
          <div className="editorial-actions">
            <Link href="/near#register" className="brutal-button button-acid">PUBLISH AN AGENT <span>→</span></Link>
            <Link href="/docs#run-agent" className="brutal-button button-paper">READ THE DOCS <span>↗</span></Link>
          </div>
        </header>

        <section className="agent-package-grid" aria-label="Repository agent packages">
          {catalog.agents.map((agent, index) => (
            <article className={`agent-package-card agent-package-${index}`} key={agent.id} data-reveal="up" data-reveal-delay={index * 90}>
              <div className="agent-package-top"><span>{agent.category}</span><span>REPO PACKAGE · {agent.id}</span></div>
              <div className="agent-package-symbol" aria-hidden="true">{['⌕', 'Ⓝ', '▤'][index]}</div>
              <h2>{agent.name}</h2>
              <p>{agent.description}</p>
              <ul>{agent.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>
              <div className="agent-package-state"><span className="package-status-dot" /> READY TO RUN WHEN A PROVIDER IS CONFIGURED</div>
              <Link href={`/near?template=${agent.id}#register`} className="small-brutal-button">CONFIGURE FOR TESTNET ↗</Link>
            </article>
          ))}
        </section>

        <section className="editorial-note" data-reveal="up">
          <strong>Package source</strong>
          <p>Catalog and system prompts are in <code>web/public/agents/</code>. The provider reads the selected package for NEAR AI Cloud inference. Packages are templates until a provider runs the adapter, owns the listed account, and registers the HTTPS endpoint on-chain.</p>
          <Link href="/docs#trust">How listings and payments work →</Link>
        </section>
      </div>
    </main>
  );
}
