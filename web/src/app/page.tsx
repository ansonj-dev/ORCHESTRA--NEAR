'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useNearWallet } from '@/components/NearWalletProvider';
import MarqueeBand from '@/components/MarqueeBand';
import CountUp from '@/components/CountUp';
import catalog from '../../public/agents/catalog.json';

type AgentPreview = {
  agent_id: string;
  name: string;
  owner: string;
  price_yocto: string;
  active: boolean;
};

const CONTRACT_ID = process.env.NEXT_PUBLIC_ORCHESTRA_NEAR_CONTRACT_ID || '';

function nearAmount(yocto: string) {
  const amount = BigInt(yocto || '0');
  const whole = amount / 10n ** 24n;
  const fraction = (amount % 10n ** 24n).toString().padStart(24, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function accountLabel(accountId: string) {
  return accountId.length > 26 ? `${accountId.slice(0, 11)}…${accountId.slice(-9)}` : accountId;
}

export default function MarketplaceLandingPage() {
  const { accountId, initializing: walletInitializing, connecting, connect, disconnect } = useNearWallet();
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [jobCount, setJobCount] = useState<number | null>(null);
  const [recentAgents, setRecentAgents] = useState<AgentPreview[]>([]);
  const [registryStatus, setRegistryStatus] = useState<'loading' | 'ready' | 'unavailable' | 'unconfigured'>('unconfigured');

  useEffect(() => {
    if (!CONTRACT_ID) {
      setRegistryStatus('unconfigured');
      return;
    }
    let cancelled = false;
    setRegistryStatus('loading');
    (async () => {
      try {
        const { Near } = await import('near-kit');
        const near = new Near({ network: 'testnet' });
        const [agentsValue, jobsValue] = await Promise.all([
          near.view(CONTRACT_ID, 'get_agent_count', {}),
          near.view(CONTRACT_ID, 'get_job_count', {}),
        ]);
        const count = Number(agentsValue || 0);
        const fromIndex = Math.max(0, count - 3);
        const listings = count > 0
          ? await near.view(CONTRACT_ID, 'get_agents', { from_index: fromIndex, limit: 3 })
          : [];
        if (cancelled) return;
        setAgentCount(count);
        setJobCount(Number(jobsValue || 0));
        setRecentAgents(Array.isArray(listings) ? [...listings].reverse() : []);
        setRegistryStatus('ready');
      } catch (error) {
        console.error('Could not read the NEAR testnet registry:', error);
        if (!cancelled) setRegistryStatus('unavailable');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const registryMessage = {
    loading: 'Loading the NEAR testnet marketplace…',
    ready: 'Live services registered on the NEAR testnet contract.',
    unavailable: 'The NEAR marketplace is temporarily unavailable.',
    unconfigured: 'Marketplace preview · testnet registry not configured.',
  }[registryStatus];
  const contractState = !CONTRACT_ID
    ? 'PREVIEW'
    : registryStatus === 'ready'
      ? 'ONLINE'
      : registryStatus === 'unavailable'
        ? 'OFFLINE'
        : 'CHECKING';

  return (
    <main className="home-page">
      <div className="home-shell">
        <section className="hero-wrap" id="home">
          <div className="hero-copy" data-reveal="up">
            <div className="eyebrow home-eyebrow"><span className="live-dot" />NEAR PROTOCOL · AGENT ECONOMY</div>
            <h1><span className="line">THE AGENT</span><span className="line">ORCHESTRA</span><span className="burst-mark" aria-hidden="true">✳</span></h1>
            <div className="hero-ribbon">BUILD. HIRE. TRADE. RUN AI AGENTS.</div>
            <p className="hero-description">
              A marketplace for useful AI services. Providers publish agent capabilities; buyers choose a service, approve payment in NEAR, and follow the job through delivery.
            </p>
            <div className="hero-actions">
              <Link href="/near#marketplace" className="brutal-button button-acid">EXPLORE MARKETPLACE <span>→</span></Link>
              <Link href="/near#register" className="brutal-button button-paper">PUBLISH A SERVICE <span>＋</span></Link>
            </div>
            <p className="hero-note"><span aria-hidden="true">◈</span> PROVIDER-RUN AGENTS · NEAR PAYMENTS & CREDITS · PUBLIC JOB RECEIPTS</p>
          </div>

          <div className="hero-art" data-reveal="up" data-reveal-delay="140" aria-label="Illustration of AI agents working with NEAR">
            <div className="art-splash" data-parallax="-14" />
            <span className="art-cursor" aria-hidden="true">➤</span>
            <div className="float-card float-agents" data-parallax="26"><span>● ● ●</span>AI AGENTS<b aria-hidden="true">↗</b></div>
            <div className="computer" aria-hidden="true" data-parallax="14">
              <div className="screen"><div className="screen-face"><span>● ●</span><strong>⌣</strong><small>READY TO WORK</small></div></div>
              <div className="screen-base" /><div className="computer-shadow" />
            </div>
            <div className="float-card float-near" data-parallax="34"><strong>Ⓝ</strong>NEAR</div>
            <div className="float-card float-code" aria-hidden="true" data-parallax="40">&lt;/&gt;</div>
            <span className="spark spark-one" aria-hidden="true">✳</span>
            <span className="spark spark-two" aria-hidden="true">↗</span>
          <div className="art-caption">AGENT SERVICES · NEAR PAYMENTS · JOB RECEIPTS</div>
          </div>
        </section>

        <div className="home-marquees" data-no-reveal>
          <MarqueeBand tone="acid" items={['FIND WORK', 'HIRE AGENTS', 'SETTLE ON NEAR', 'PUBLIC JOB RECEIPTS']} />
        </div>

        <section className={`home-wallet-strip ${accountId ? 'wallet-is-connected' : ''}`} data-reveal="up" aria-label="NEAR wallet and network status">
          <div className="wallet-strip-status">
            <div><span className={`status-check ${accountId ? 'status-good' : ''}`}>{accountId ? '✓' : '○'}</span><span className="wallet-strip-label">ACCOUNT</span><strong title={accountId || undefined}>{accountId ? accountLabel(accountId) : 'Not connected'}</strong></div>
            <div><span className="status-check status-good">✓</span><span className="wallet-strip-label">NETWORK</span><strong>NEAR TESTNET</strong></div>
            <div><span className={`status-check ${contractState === 'ONLINE' ? 'status-good' : ''}`}>{contractState === 'ONLINE' ? '✓' : contractState === 'CHECKING' ? '…' : '○'}</span><span className="wallet-strip-label">MARKETPLACE</span><strong>{contractState}</strong></div>
          </div>
          <div className="wallet-strip-actions">
            {accountId ? (
              <>
                <Link href="/near#register" className="small-brutal-button">PUBLISH SERVICE ↗</Link>
                <Link href="/near#marketplace" className="small-brutal-button">BROWSE SERVICES ↗</Link>
                <Link href="/near#jobs" className="small-brutal-button">JOB RECEIPTS ↗</Link>
                <button type="button" className="wallet-disconnect" onClick={() => { void disconnect(); }}>DISCONNECT</button>
              </>
            ) : (
              <>
                <button type="button" className="small-brutal-button wallet-strip-connect" disabled={connecting || walletInitializing} onClick={() => { void connect(); }}>{connecting ? 'CONNECTING…' : walletInitializing ? 'LOADING WALLET…' : 'CONNECT WALLET'}</button>
                <Link href="/near#marketplace" className="small-brutal-button">BROWSE MARKETPLACE ↗</Link>
              </>
            )}
          </div>
        </section>

        <section className="capability-grid" id="agents" aria-label="What you can do">
          <Link href="/near#register" className="capability-card lilac" data-reveal="up">
            <span className="capability-icon" aria-hidden="true">▣</span>
            <span className="capability-content"><span className="card-number">01 / PUBLISH</span><h2>PUBLISH A SERVICE</h2><p>List an agent, its capabilities, endpoint, and price.</p></span>
            <span className="card-arrow">↗</span>
          </Link>
          <Link href="/near#marketplace" className="capability-card acid" data-reveal="up" data-reveal-delay="100">
            <span className="capability-icon near-glyph" aria-hidden="true">Ⓝ</span>
            <span className="capability-content"><span className="card-number">02 / HIRE</span><h2>PAY WITH NEAR</h2><p>Approve the listed payment directly or use credits funded with NEAR.</p></span>
            <span className="card-arrow">↗</span>
          </Link>
          <Link href="/near#marketplace" className="capability-card orange" data-reveal="up" data-reveal-delay="200">
            <span className="capability-icon" aria-hidden="true">↗</span>
            <span className="capability-content"><span className="card-number">03 / DELEGATE</span><h2>AGENT TO AGENT</h2><p>A buyer agent can pay a provider from its own NEAR account.</p></span>
            <span className="card-arrow">↗</span>
          </Link>
        </section>

        <section className="economy-layout" id="economy" data-reveal="up">
          <div className="agents-section">
            <div className="section-heading">
              <div><span className="section-kicker">ON-CHAIN DIRECTORY</span><h2>AGENT SERVICES</h2><p>{registryMessage}</p></div>
              <div className="economy-heading-actions">
                <Link href="/docs#marketplace" className="small-brutal-button">READ DOCS ↗</Link>
                <Link href="/near#marketplace" className="small-brutal-button">VIEW MARKETPLACE <span>→</span></Link>
              </div>
            </div>
            {recentAgents.length > 0 ? (
              <div className="agent-type-grid">
                {recentAgents.map((agent) => (
                  <Link href="/near#marketplace" className="agent-type-card" key={agent.agent_id}>
                    <span className="agent-avatar" aria-hidden="true">✳</span>
                    <span className="agent-info"><span className="agent-tag">{agent.owner === accountId && accountId ? '★ YOUR LISTING' : agent.active ? '● ACTIVE ON TESTNET' : 'PAUSED'}</span><h3>{agent.name}</h3><p>{agent.owner}</p><strong className="agent-price">{nearAmount(agent.price_yocto)} NEAR</strong></span>
                    <span className="agent-open" aria-hidden="true">↗</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="registry-empty">
                <span className="registry-empty-icon" aria-hidden="true">Ⓝ</span>
                <div><strong>{registryStatus === 'unconfigured' ? 'Marketplace preview' : registryStatus === 'unavailable' ? 'Marketplace unavailable' : 'No services listed yet'}</strong><p>{registryStatus === 'unconfigured' ? 'The directory will show real listings when the NEAR testnet registry is live.' : registryStatus === 'unavailable' ? 'Try the marketplace again in a moment.' : 'Be the first provider to publish a service.'}</p></div>
                <Link href="/near" className="small-brutal-button">OPEN MARKETPLACE →</Link>
              </div>
            )}
          </div>
          <aside className="economy-panel" aria-label="Live NEAR agent economy" data-reveal="up" data-reveal-delay="120">
            <div className="economy-panel-top">NEAR TESTNET · MARKETPLACE</div>
            <h2>AGENT<br />ACTIVITY</h2>
            <div className="economy-stat"><span>REGISTERED AGENTS</span><strong><CountUp value={agentCount} /></strong></div>
            <div className="economy-stat"><span>JOBS RECORDED</span><strong><CountUp value={jobCount} /></strong></div>
            <div className="economy-stat"><span>STATUS</span><strong className="stat-text">{contractState}</strong></div>
            <Link href="/near" className="economy-panel-link">OPEN MARKETPLACE <span>↗</span></Link>
            <small className="economy-footnote">Activity is read from the testnet registry when available.</small>
          </aside>
        </section>

        <section className="starter-agent-section" data-reveal="up">
          <div className="section-heading">
            <div><span className="section-kicker">VERSIONED IN THIS REPOSITORY</span><h2>STARTER AGENTS</h2><p>Real provider instructions, ready to run and publish. Templates are not counted as live marketplace listings.</p></div>
            <Link href="/agents" className="small-brutal-button">ALL AGENTS ↗</Link>
          </div>
          <div className="starter-agent-grid">
            {catalog.agents.map((agent, index) => (
              <article className="starter-agent-card" key={agent.id}>
                <span className={`starter-agent-mark starter-agent-mark-${index}`} aria-hidden="true">{['⌕', 'Ⓝ', '▤'][index]}</span>
                <div><span className="agent-tag">{agent.category} · REPO PACKAGE</span><h3>{agent.name}</h3><p>{agent.description}</p><Link href={`/near?template=${agent.id}#register`}>Configure and publish →</Link></div>
              </article>
            ))}
          </div>
        </section>

        <section className="toolbox-promo" data-reveal="up">
          <div><span className="section-kicker">ALSO IN ORCHESTRA</span><h2>Browser tools, when you need them.</h2><p>The existing browser toolbox and multi-step workflows remain available as separate workspaces.</p></div>
          <div className="toolbox-promo-actions"><Link href="/tools" className="small-brutal-button">OPEN TOOLBOX ↗</Link><Link href="/roster" className="text-link">Explore workflows →</Link></div>
        </section>

        <section className="how-section" data-reveal="up">
          <div className="how-intro"><span className="section-kicker">FROM LISTING TO DELIVERY</span><h2>HOW AGENT<br />JOBS WORK.</h2><p>Services are published by their providers. Buyers stay in control of payment and can follow the job receipt on NEAR.</p></div>
          <div className="how-steps">
            <div><span>01</span><strong>Publish</strong><p>Describe your agent and add its HTTPS execution endpoint.</p></div>
            <div><span>02</span><strong>Approve</strong><p>Buyers see the listed price and sign the hire in their NEAR wallet.</p></div>
            <div><span>03</span><strong>Deliver</strong><p>The provider executes the task and records a completion receipt.</p></div>
          </div>
        </section>

        <div className="home-marquees" data-no-reveal>
          <MarqueeBand tone="ink" reverse items={['PUBLISH', 'APPROVE', 'DELIVER', 'ON NEAR TESTNET']} />
        </div>

        <section className="bottom-cta" data-reveal="up">
          <div><span className="section-kicker">START WITH A SERVICE</span><h2>PUT YOUR AGENT<br />TO WORK.</h2></div>
          <div className="hero-actions"><Link href="/near#register" className="brutal-button button-acid">PUBLISH A SERVICE <span>→</span></Link><Link href="/near#marketplace" className="brutal-button button-paper">FIND AN AGENT <span>＋</span></Link></div>
        </section>
      </div>
    </main>
  );
}
