'use client';

import { useEffect, useState } from 'react';
import MarqueeBand from './MarqueeBand';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useNearWallet } from './NearWalletProvider';

const primaryLinks = [
  { name: 'Home', href: '/' },
  { name: 'Agents', href: '/agents' },
  { name: 'Marketplace', href: '/near#marketplace' },
  { name: 'NEAR Economy', href: '/#economy' },
  { name: 'Build', href: '/near#register' },
  { name: 'Docs', href: '/docs' },
];

const workspaceLinks = [
  { name: 'Publish an agent', href: '/near#register' },
  { name: 'Job receipts', href: '/near#jobs' },
  { name: 'Agent workflows', href: '/roster' },
  { name: 'Browser toolbox', href: '/tools' },
  { name: 'Credits & ledger', href: '/dashboard' },
  { name: 'Tool studio', href: '/studio' },
  { name: 'Developer guide', href: '/ide-bridge' },
  { name: 'Interactive demo', href: '/demo-target' },
];
const CONTRACT_ID = process.env.NEXT_PUBLIC_ORCHESTRA_NEAR_CONTRACT_ID || '';

function accountLabel(accountId: string) {
  return accountId.length > 22 ? `${accountId.slice(0, 10)}…${accountId.slice(-8)}` : accountId;
}

function creditLabel(balanceYocto: string) {
  const tenThousandths = BigInt(balanceYocto || '0') / (10n ** 18n);
  return `${tenThousandths / 10000n}.${(tenThousandths % 10000n).toString().padStart(4, '0')}`;
}

export default function Navbar() {
  const pathname = usePathname();
  const { near, accountId, connecting, initializing, connect, disconnect, error: nearWalletError } = useNearWallet();
  const [creditBalance, setCreditBalance] = useState<string | null>(null);
  const [nearBalance, setNearBalance] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [webmcp, setWebmcp] = useState(false);

  useEffect(() => {
    setWebmcp('modelContext' in navigator);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  useEffect(() => {
    setMobileOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!accountId || !near || !CONTRACT_ID) {
      setCreditBalance(null);
      return;
    }
    let active = true;
    let reading = false;
    const readCredits = async () => {
      if (reading) return;
      reading = true;
      try {
        const balance = await near.view(CONTRACT_ID, 'get_credit_balance', { account_id: accountId });
        if (active) setCreditBalance(String(balance ?? '0'));
      } catch {
        if (active) setCreditBalance(null);
      } finally {
        reading = false;
      }
    };
    void readCredits();
    const interval = window.setInterval(readCredits, 30000);
    window.addEventListener('orchestra:near-credits-updated', readCredits);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('orchestra:near-credits-updated', readCredits);
    };
  }, [near, accountId]);

  useEffect(() => {
    if (!accountId || !near) {
      setNearBalance(null);
      return;
    }
    let active = true;
    let reading = false;
    const readBalance = async () => {
      if (reading) return;
      reading = true;
      try {
        const available = await near.getBalance(accountId);
        if (active) setNearBalance(available);
      } catch {
        if (active) setNearBalance(null);
      } finally {
        reading = false;
      }
    };
    void readBalance();
    const interval = window.setInterval(readBalance, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [near, accountId]);

  const syncExtension = () => {
    setSyncStatus('Syncing browser agents…');
    void (async () => {
      try {
        const [walletResponse, toolsResponse] = await Promise.all([
          fetch('/api/wallet').catch(() => null),
          fetch('/api/user-tools'),
        ]);
        if (!toolsResponse.ok) throw new Error('Could not load your rented browser agents.');
        const [walletData, toolsData] = await Promise.all([
          walletResponse?.ok ? walletResponse.json().catch(() => null) : Promise.resolve(null),
          toolsResponse.json(),
        ]);
        if (!toolsData.success || !Array.isArray(toolsData.tools)) throw new Error('Could not load your rented browser agents.');
        const activeTools = toolsData.tools;
        window.dispatchEvent(new CustomEvent('orchestra:refresh-request'));
        const requestId = `orchestra-sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const result = await new Promise<{ success: boolean; tools?: number; error?: string }>((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            window.removeEventListener('message', onMessage);
            reject(new Error('Browser extension not detected. Install or reload Orchestra Browser Tools, then try again.'));
          }, 2500);
          const onMessage = (event: MessageEvent) => {
            if (event.source !== window || event.origin !== window.location.origin) return;
            const message = event.data;
            if (message?.source !== 'orchestra-extension' || message.type !== 'SYNC_RESULT' || message.requestId !== requestId) return;
            window.clearTimeout(timeout);
            window.removeEventListener('message', onMessage);
            resolve(message.result);
          };
          window.addEventListener('message', onMessage);
          window.postMessage({
            source: 'orchestra-app',
            type: 'SYNC_TO_EXTENSION',
            requestId,
            payload: {
              ...(walletData?.success && typeof walletData.balance === 'number' ? { demoCreditBalance: walletData.balance } : {}),
              tools: activeTools,
            },
          }, window.location.origin);
        });
        if (!result.success) throw new Error(result.error || 'Extension sync failed.');
        setSyncStatus(`Synced ${result.tools ?? activeTools.length} agents`);
        window.setTimeout(() => setSyncStatus(null), 2200);
      } catch (cause) {
        setSyncStatus(cause instanceof Error ? cause.message : 'Sync unavailable');
        window.setTimeout(() => setSyncStatus(null), 2600);
      }
    })();
  };

  const isActive = (href: string) => {
    const [route, anchor] = href.split('#');
    const currentRoute = route || '/';
    return pathname === currentRoute && (!anchor || anchor === 'marketplace');
  };

  return (
    <>
      <header className="site-header">
        <div className="nav-inner">
          <Link href="/" className="brand-word" aria-label="Orchestra home">ORCHESTRA<span>✳</span></Link>

          <nav id="main-nav" className={`main-nav ${mobileOpen ? 'nav-open' : ''}`} aria-label="Main navigation">
            {primaryLinks.map(link => (
              <Link key={link.name} href={link.href} onClick={() => setMobileOpen(false)} aria-current={isActive(link.href) ? 'page' : undefined} className={`nav-link ${isActive(link.href) ? 'active' : ''}`}>{link.name}</Link>
            ))}
            <details className={`nav-more ${moreOpen ? 'more-open' : ''}`} open={moreOpen} onToggle={(event) => setMoreOpen((event.currentTarget as HTMLDetailsElement).open)}>
              <summary>More <span aria-hidden="true">⌄</span></summary>
              <div className="more-menu">
                {workspaceLinks.map(link => <Link key={link.href} href={link.href} onClick={() => setMoreOpen(false)}>{link.name}<span aria-hidden="true">↗</span></Link>)}
                <button type="button" onClick={syncExtension}>{syncStatus || 'Sync browser extension'}<span aria-hidden="true">⟳</span></button>
                {accountId && <button type="button" onClick={() => { void disconnect(); setMoreOpen(false); }}>Disconnect {accountLabel(accountId)}<span aria-hidden="true">×</span></button>}
              </div>
            </details>
            <div className="mobile-nav-actions">
              {accountId ? <Link href="/near" className="wallet-connect wallet-connected" onClick={() => setMobileOpen(false)} title={`Connected to NEAR testnet as ${accountId}`}>Ⓝ {accountLabel(accountId)}{nearBalance ? ` · ${nearBalance} NEAR` : ''}</Link> : (
                <button type="button" className="wallet-connect" disabled={connecting || initializing} onClick={() => { void connect(); setMobileOpen(false); }}>{connecting ? 'Connecting wallet…' : 'Connect NEAR wallet'}</button>
              )}
              <Link href="/dashboard" className="mobile-credit-action" onClick={() => setMobileOpen(false)}>Open credits ledger ↗</Link>
            </div>
          </nav>

          <div className="nav-actions">
            <Link href="/near" className="network-pill" title={accountId ? 'Wallet connected to NEAR testnet' : 'This app is configured for NEAR testnet; connect a wallet to use it'}><span aria-hidden="true">Ⓝ</span><span className="network-pill-label">{accountId ? 'NEAR TESTNET' : 'TESTNET MODE'}</span></Link>
            {accountId && creditBalance !== null && <Link href="/dashboard" className="wallet-credit-pill" title="NEAR-backed marketplace credits"><span>CR</span><strong>{creditLabel(creditBalance)}</strong></Link>}
            {accountId ? (
              <Link href="/near" className="wallet-connect wallet-connected" title={`Connected to NEAR testnet as ${accountId}${nearBalance ? ` · ${nearBalance} NEAR available` : ''}`}><span aria-hidden="true">Ⓝ</span><span>{accountLabel(accountId)}</span>{nearBalance && <span className="wallet-native-balance">{nearBalance} NEAR</span>}</Link>
            ) : (
              <button type="button" className="wallet-connect" disabled={connecting || initializing} onClick={() => { void connect(); }}>
                {connecting ? 'Connecting…' : initializing ? 'Loading wallet…' : <><span className="connect-long">Connect wallet</span><span className="connect-short">Connect</span></>}
              </button>
            )}
            <button type="button" className="mobile-menu" onClick={() => setMobileOpen(open => !open)} aria-expanded={mobileOpen} aria-controls="main-nav" aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}>
              <span className="menu-icon" aria-hidden="true">{mobileOpen ? '×' : '☰'}</span><span className="menu-label">{mobileOpen ? 'CLOSE' : 'MENU'}</span>
            </button>
          </div>
        </div>
      </header>
      <div className="status-strip" role="status">
        <div className="status-strip-inner">
          <span className={`status-chip ${webmcp ? '' : 'off'}`} title="Whether this browser exposes the WebMCP model context"><i />{webmcp ? 'WEBMCP LIVE' : 'WEBMCP NOT DETECTED'}</span>
          <button type="button" className="status-sync" onClick={syncExtension}>{syncStatus || 'SYNC'}</button>
          <MarqueeBand items={['BUILD', 'HIRE', 'TRADE', 'RUN AI AGENTS', 'NEAR TESTNET', 'PUBLIC JOB RECEIPTS']} />
        </div>
      </div>
      <div className={`drawer-scrim ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)} aria-hidden="true" />
      <nav className="mobile-dock" aria-label="App dock">
        <Link href="/near#marketplace" className={pathname === '/near' ? 'active' : undefined}><span className="dock-icon" aria-hidden="true">▦</span>Market</Link>
        <Link href="/dashboard" className={pathname === '/dashboard' ? 'active' : undefined}><span className="dock-icon" aria-hidden="true">≡</span>Ledger</Link>
        <Link href="/" className={pathname === '/' ? 'active' : undefined}><span className="dock-icon" aria-hidden="true">Ⓝ</span>NEAR</Link>
        <Link href="/studio" className={pathname === '/studio' ? 'active' : undefined}><span className="dock-icon" aria-hidden="true">✎</span>Studio</Link>
        <button type="button" onClick={() => setMobileOpen(open => !open)} aria-label="Open all links"><span className="dock-icon" aria-hidden="true">⋯</span>More</button>
      </nav>
      {nearWalletError && <div className="wallet-feedback" role="alert">{nearWalletError}<button type="button" onClick={() => { void connect(); }}>Try again</button></div>}
    </>
  );
}
