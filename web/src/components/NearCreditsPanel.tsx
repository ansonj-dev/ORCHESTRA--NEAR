'use client';

import { useCallback, useEffect, useState } from 'react';
import { useNearWallet } from './NearWalletProvider';

const CONTRACT_ID = process.env.NEXT_PUBLIC_ORCHESTRA_NEAR_CONTRACT_ID || '';
const YOCTO = 10n ** 24n;

function normalizeNear(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,24})?$/.test(normalized)) throw new Error('Enter a NEAR amount with up to 24 decimal places.');
  const [whole, fraction = ''] = normalized.split('.');
  return `${BigInt(whole)}.${fraction.padEnd(24, '0')}`;
}

function creditsFromYocto(value: string) {
  const tenThousandths = BigInt(value || '0') / (10n ** 18n);
  return `${tenThousandths / 10000n}.${(tenThousandths % 10000n).toString().padStart(4, '0')}`;
}

function nearFromYocto(value: string) {
  const raw = BigInt(value || '0');
  const whole = raw / YOCTO;
  const fraction = (raw % YOCTO) / (10n ** 20n);
  return `${whole}.${fraction.toString().padStart(4, '0')}`;
}

export default function NearCreditsPanel() {
  const { near, accountId, initializing, connecting, connect } = useNearWallet();
  const [creditBalance, setCreditBalance] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('0.1');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const refreshBalance = useCallback(async () => {
    if (!accountId || !near || !CONTRACT_ID) {
      setCreditBalance(null);
      return;
    }
    try {
      const balance = await near.view(CONTRACT_ID, 'get_credit_balance', { account_id: accountId });
      setCreditBalance(String(balance ?? '0'));
      setError('');
    } catch {
      setCreditBalance(null);
      setError('The configured contract does not expose credits yet, or the testnet read failed. Deploy the credit-enabled contract and retry.');
    }
  }, [accountId, near]);

  useEffect(() => { void refreshBalance(); }, [refreshBalance]);

  const buyCredits = async () => {
    if (!near || !accountId || !CONTRACT_ID) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const amount = normalizeNear(topUpAmount);
      if (BigInt(amount.replace('.', '')) <= 0n) throw new Error('Top-up must be greater than zero.');
      await near.call(CONTRACT_ID, 'deposit_credits', {}, { attachedDeposit: `${amount} NEAR`, gas: '30 Tgas' });
      await refreshBalance();
      window.dispatchEvent(new CustomEvent('orchestra:near-credits-updated'));
      setStatus('NEAR credit purchase submitted. The updated balance is read from the contract.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not buy credits with NEAR.');
    } finally {
      setBusy(false);
    }
  };

  const withdrawAll = async () => {
    if (!near || !accountId || !CONTRACT_ID || creditBalance === null || BigInt(creditBalance) <= 0n) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await near.call(CONTRACT_ID, 'withdraw_credits', { amount_yocto: creditBalance }, { gas: '30 Tgas' });
      await refreshBalance();
      window.dispatchEvent(new CustomEvent('orchestra:near-credits-updated'));
      setStatus('Withdrawal submitted. Your unused credits and account storage reserve are returned as NEAR.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not withdraw credits.');
    } finally {
      setBusy(false);
    }
  };

  const estimatedCredits = Number(topUpAmount) > 0 ? (Number(topUpAmount) * 100).toFixed(2) : '0.00';

  return (
    <section className="near-credits-panel" aria-labelledby="near-credits-title" data-reveal="up">
      <div className="near-credits-head">
        <div><span className="section-kicker">CONTRACT-BACKED · NEAR TESTNET</span><h2 id="near-credits-title">NEAR credits</h2><p>Top up once, then pay for marketplace jobs from your balance.</p></div>
        <span className="near-credits-rate">100 CR = 1 NEAR</span>
      </div>
      {!accountId ? (
        <div className="near-credits-connect"><p>Connect a NEAR testnet wallet to see or fund your credit balance.</p><button type="button" className="small-brutal-button" onClick={() => { void connect(); }} disabled={connecting || initializing}>{connecting ? 'CONNECTING…' : initializing ? 'LOADING WALLET…' : 'CONNECT WALLET'}</button></div>
      ) : !CONTRACT_ID ? (
        <div className="near-credits-empty"><strong>Marketplace contract not configured</strong><p>Set <code>NEXT_PUBLIC_ORCHESTRA_NEAR_CONTRACT_ID</code> to use NEAR credits.</p></div>
      ) : (
        <>
          <div className="near-credits-balance">
            <div><span>AVAILABLE BALANCE</span><strong>{creditBalance === null ? '—' : `${creditsFromYocto(creditBalance)} CR`}</strong><small>{creditBalance === null ? 'Contract balance unavailable' : `${nearFromYocto(creditBalance)} NEAR value · read from contract`}</small></div>
            <button type="button" className="small-brutal-button" onClick={() => { void withdrawAll(); }} disabled={busy || creditBalance === null || BigInt(creditBalance || '0') === 0n}>WITHDRAW ALL ↗</button>
          </div>
          <div className="near-credits-buy">
            <label htmlFor="near-credit-topup">Top up with NEAR
              <div><input id="near-credit-topup" inputMode="decimal" value={topUpAmount} onChange={event => setTopUpAmount(event.target.value)} aria-describedby="near-credit-estimate" /><span>NEAR</span></div>
            </label>
            <button type="button" className="brutal-button button-acid" onClick={() => { void buyCredits(); }} disabled={busy || creditBalance === null}>{busy ? 'WAITING FOR WALLET…' : 'BUY CREDITS'}</button>
            <small id="near-credit-estimate">About {estimatedCredits} CR before the one-time account storage reserve. Your wallet approves the deposit.</small>
          </div>
        </>
      )}
      <p className="near-credits-footnote">Credits are a NEAR-denominated balance in the Orchestra contract. Marketplace providers receive the listed NEAR amount. The account storage reserve is returned with a full withdrawal.</p>
      {status && <p className="near-credit-feedback" role="status">{status}</p>}
      {error && <p className="near-credit-error" role="alert">{error}</p>}
    </section>
  );
}
