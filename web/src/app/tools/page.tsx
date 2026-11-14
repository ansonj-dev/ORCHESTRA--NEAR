'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import ToolCard from '@/components/ToolCard';
import { WebMCPTool } from '@/types';

const categories = ['All', 'E-Commerce', 'DevOps & Cloud', 'Productivity', 'Security & Auth', 'Data Extraction', 'Web3 & Onchain'];

export default function BrowserToolsPage() {
  const [tools, setTools] = useState<WebMCPTool[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [billingAvailable, setBillingAvailable] = useState(false);
  const [billingChecked, setBillingChecked] = useState(false);
  const [recentExecution, setRecentExecution] = useState<{ name: string; time: string } | null>(null);

  const loadTools = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL('/api/tools', window.location.origin);
      if (selectedCategory !== 'All') url.searchParams.set('category', selectedCategory);
      if (searchQuery.trim()) url.searchParams.set('search', searchQuery.trim());
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error('Could not load browser tools.');
      const data = await response.json();
      setTools(data.tools || []);
    } catch (error) {
      console.error(error);
      setTools([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchQuery]);

  useEffect(() => { void loadTools(); }, [loadTools]);

  useEffect(() => {
    let active = true;
    fetch('/api/wallet', { cache: 'no-store' })
      .then(async response => ({ response, data: await response.json().catch(() => null) }))
      .then(({ response, data }) => {
        if (!active) return;
        setBillingAvailable(response.ok && !!data?.success);
        setBillingChecked(true);
      })
      .catch(() => {
        if (active) {
          setBillingAvailable(false);
          setBillingChecked(true);
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const refresh = () => { void loadTools(); };
    const handleExecuted = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setRecentExecution({ name: detail?.toolName || 'Browser tool', time: new Date().toLocaleTimeString() });
      window.setTimeout(() => setRecentExecution(null), 4500);
    };
    window.addEventListener('orchestra:rental-changed', refresh);
    window.addEventListener('orchestra:tool-executed', handleExecuted);
    return () => {
      window.removeEventListener('orchestra:rental-changed', refresh);
      window.removeEventListener('orchestra:tool-executed', handleExecuted);
    };
  }, [loadTools]);

  return (
    <main className="home-page toolbox-page">
      <div className="home-shell">
        <header className="toolbox-page-header" data-reveal="up">
          <span className="section-kicker">ORCHESTRA TOOLS</span>
          <h1>Browser toolbox</h1>
          <p>Use browser-side utilities for focused tasks. These local application credits are separate from NEAR marketplace payments.</p>
          <div className="toolbox-page-links">
            <Link href="/studio" className="small-brutal-button">BUILD A TOOL ↗</Link>
            <Link href="/roster" className="small-brutal-button">OPEN WORKFLOWS ↗</Link>
            <Link href="/near#marketplace" className="text-link">Go to the NEAR marketplace →</Link>
          </div>
        </header>

        <div className={`toolbox-billing-note ${billingAvailable ? 'toolbox-billing-demo' : ''}`} role="status">
          {billingAvailable
            ? 'Browser tool credits are a local app ledger for this development session. They are separate from NEAR and do not pay for marketplace jobs.'
            : billingChecked
              ? 'Browser tool execution is not enabled in this deployment. The NEAR marketplace uses its separate wallet-approved payment flow.'
              : 'Checking browser tool availability…'}
        </div>

        <section className="marketplace-section" id="toolbox" data-reveal="up">
          <div className="catalog-controls">
            <label className="catalog-search">
              <span className="sr-only">Search browser tools</span><span aria-hidden="true">⌕</span>
              <input type="search" placeholder="Search browser tools…" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} />
            </label>
            <div className="category-list" aria-label="Filter tools by category">
              {categories.map(category => <button key={category} onClick={() => setSelectedCategory(category)} aria-pressed={selectedCategory === category} className={`category-chip ${selectedCategory === category ? 'selected' : ''}`}>{category}</button>)}
            </div>
          </div>
          <div className="catalog-count"><span>{loading ? 'LOADING TOOLS…' : `${tools.length} TOOLS`}</span><Link href="/dashboard">OPEN CREDIT LEDGER ↗</Link></div>
          {loading ? <div className="catalog-empty" role="status">Loading tools…</div> : tools.length === 0 ? (
            <div className="catalog-empty">No tools match that search. Try a different category or phrase.</div>
          ) : (
            <div className="tool-grid">
              {tools.map(tool => <ToolCard key={tool.id} tool={tool} disabled={!billingAvailable} onRentalToggled={() => {}} onExecutionCompleted={() => setRecentExecution({ name: tool.title, time: new Date().toLocaleTimeString() })} />)}
            </div>
          )}
        </section>
      </div>
      {recentExecution && <div className="execution-toast" role="status"><span className="toast-mark">✓</span><div><strong>Browser action complete</strong><small>{recentExecution.name} · {recentExecution.time}</small></div></div>}
    </main>
  );
}
