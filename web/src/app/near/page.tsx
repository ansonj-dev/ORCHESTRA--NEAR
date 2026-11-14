'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useNearWallet } from '@/components/NearWalletProvider';
import catalog from '../../../public/agents/catalog.json';

type Job = {
  id: number;
  agent_id: string;
  buyer: string;
  provider: string;
  payment_mode?: string;
  task_hash: string;
  result_hash: string | null;
  price_yocto: string;
  status: string;
  created_at: number;
  completed_at: number | null;
  rated: boolean;
};

type Agent = {
  agent_id: string;
  owner: string;
  name: string;
  description: string;
  endpoint_url: string;
  price_yocto: string;
  active: boolean;
  registered_at: number;
  rating_sum: number;
  rating_count: number;
  completed_jobs: number;
  total_earned_yocto: string;
};

const CONTRACT_ID = process.env.NEXT_PUBLIC_ORCHESTRA_NEAR_CONTRACT_ID || '';
const EXPLORER = 'https://testnet.nearblocks.io';

function yoctoToNear(value: string) {
  const amount = BigInt(value || '0');
  const whole = amount / 10n ** 24n;
  const fraction = (amount % (10n ** 24n)).toString().padStart(24, '0').replace(/0+$/, '');
  return fraction ? whole.toString() + '.' + fraction : whole.toString();
}

function yoctoToCredits(value: string) {
  const tenThousandths = BigInt(value || '0') / (10n ** 18n);
  return `${tenThousandths / 10000n}.${(tenThousandths % 10000n).toString().padStart(4, '0')}`;
}

function nearToYocto(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,24})?$/.test(normalized)) {
    throw new Error('Enter a valid NEAR amount with up to 24 decimals.');
  }
  const parts = normalized.split('.');
  const fraction = parts[1] || '';
  return (BigInt(parts[0]) * 10n ** 24n + BigInt((fraction + '0'.repeat(24)).slice(0, 24))).toString();
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export default function NearEconomyPage() {
  const { near, accountId, initializing: walletInitializing, connecting: walletConnecting, connect, disconnect } = useNearWallet();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [creditBalanceYocto, setCreditBalanceYocto] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<'near' | 'credits'>('near');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState<any>(null);
  const [starterAgentId, setStarterAgentId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [endpointHealthy, setEndpointHealthy] = useState(false);
  const [endpointStatus, setEndpointStatus] = useState('');
  const [price, setPrice] = useState('0.01');
  const [task, setTask] = useState('Run a sample research task and return a structured result.');
  const [rating, setRating] = useState('5');
  const [consentToDispatch, setConsentToDispatch] = useState(false);

  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get('template');
    if (!requestedId) return;
    const starter = catalog.agents.find((agent) => agent.id === requestedId);
    if (!starter) return;
    setStarterAgentId(starter.id);
    setName(starter.name);
    setDescription(starter.description);
  }, []);

  useEffect(() => {
    setEndpointHealthy(false);
    setEndpointStatus('');
  }, [accountId]);

  const refreshCreditBalance = useCallback(async () => {
    if (!near || !accountId || !CONTRACT_ID) {
      setCreditBalanceYocto(null);
      return;
    }
    try {
      const amount = await near.view(CONTRACT_ID, 'get_credit_balance', { account_id: accountId });
      setCreditBalanceYocto(String(amount ?? '0'));
    } catch {
      setCreditBalanceYocto(null);
    }
  }, [near, accountId]);

  useEffect(() => { void refreshCreditBalance(); }, [refreshCreditBalance]);

  const refreshJobs = useCallback(async () => {
    if (!near || !CONTRACT_ID) return;
    try {
      const countValue = await near.view(CONTRACT_ID, 'get_job_count', {});
      const count = Number(countValue || 0);
      const fromIndex = Math.max(0, count - 50);
      const rows = await near.view(CONTRACT_ID, 'get_jobs', { from_index: fromIndex, limit: 50 });
      setJobs(Array.isArray(rows) ? [...rows].reverse() : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read on-chain job history.');
    }
  }, [near]);

  const refreshAgents = useCallback(async () => {
    if (!near || !CONTRACT_ID) return;
    setLoading(true);
    try {
      const countValue = await near.view(CONTRACT_ID, 'get_agent_count', {});
      const count = Number(countValue || 0);
      const fromIndex = Math.max(0, count - 50);
      const rows = await near.view(CONTRACT_ID, 'get_agents', { from_index: fromIndex, limit: 50 });
      setAgents(Array.isArray(rows) ? [...rows].reverse() : []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the on-chain agent registry.');
    } finally {
      setLoading(false);
    }
  }, [near]);

  useEffect(() => { refreshAgents(); refreshJobs(); }, [refreshAgents, refreshJobs]);

  const checkEndpoint = async () => {
    setEndpointHealthy(false);
    setEndpointStatus('');
    setError('');
    try {
      const healthUrl = new URL(endpointUrl);
      if (healthUrl.protocol !== 'https:') throw new Error('Provider endpoint must use HTTPS.');
      if (healthUrl.pathname !== '/v1/execute') throw new Error('Provider endpoint must end in /v1/execute.');
      healthUrl.pathname = '/health';
      healthUrl.search = '';
      healthUrl.hash = '';
      const response = await fetch(healthUrl.toString(), { cache: 'no-store' });
      const health = await response.json();
      if (!response.ok || !health?.success) throw new Error('Provider health check failed.');
      if (health.account_id !== accountId) {
        throw new Error('Endpoint account ' + health.account_id + ' does not match connected wallet ' + accountId + '.');
      }
      if (health.network !== 'testnet') throw new Error('Provider endpoint is not configured for NEAR testnet.');
      if (starterAgentId && !health.built_in_agent_ids?.includes(starterAgentId)) {
        throw new Error('This provider is online but does not have the selected repository agent package loaded. Update its adapter before publishing this starter agent.');
      }
      setEndpointHealthy(true);
      setEndpointStatus('Online and bound to ' + accountId);
    } catch (e) {
      setEndpointStatus(e instanceof Error ? e.message : 'Could not verify provider endpoint.');
    }
  };

  const registerAgent = async (event: FormEvent) => {
    event.preventDefault();
    if (!near || !CONTRACT_ID) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const agentId = starterAgentId || name.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
      if (!agentId) throw new Error('Enter an agent name.');
      await near.call(CONTRACT_ID, 'register_agent', {
        agent_id: agentId,
        name: name.trim(),
        description: description.trim(),
        price_yocto: nearToYocto(price),
        endpoint_url: endpointUrl.trim(),
      });
      setNotice('Agent registration transaction submitted to NEAR testnet.');
      await refreshAgents();
      await refreshJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Agent registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const hireAgent = async (agent: Agent) => {
    if (!near || !CONTRACT_ID) return;
    setBusy(true);
    setError('');
    setNotice('');
    setLastResult(null);
    try {
      const healthUrl = new URL(agent.endpoint_url);
      if (healthUrl.protocol !== 'https:' || healthUrl.pathname !== '/v1/execute') {
        throw new Error('Provider listing has an invalid HTTPS execution endpoint.');
      }
      healthUrl.pathname = '/health';
      healthUrl.search = '';
      healthUrl.hash = '';
      const healthResponse = await fetch(healthUrl.toString(), { cache: 'no-store' });
      const health = await healthResponse.json();
      if (!healthResponse.ok || !health?.success || health.account_id !== agent.owner || health.network !== 'testnet') {
        throw new Error('Provider endpoint is offline or does not match the on-chain owner. No payment was sent.');
      }
      if (catalog.agents.some((starter) => starter.id === agent.agent_id) && !health.built_in_agent_ids?.includes(agent.agent_id)) {
        throw new Error('The provider no longer advertises this repository agent package. No payment was sent.');
      }

      // Only the SHA-256 digest is written on-chain. Keep private task details off-chain.
      const taskHash = await sha256(task);
      const created = paymentMode === 'credits'
        ? await near.call(CONTRACT_ID, 'hire_agent_with_credits', {
            agent_id: agent.agent_id,
            task_hash: taskHash,
          })
        : await near.call(CONTRACT_ID, 'hire_agent', {
            agent_id: agent.agent_id,
            task_hash: taskHash,
          }, { attachedDeposit: yoctoToNear(agent.price_yocto) + ' NEAR' });
      if (paymentMode === 'credits') {
        await refreshCreditBalance();
        window.dispatchEvent(new CustomEvent('orchestra:near-credits-updated'));
      }
      const jobId = Number((created as any)?.id);
      if (!Number.isSafeInteger(jobId)) {
        setNotice('The hire transaction returned without a readable job ID. Refresh on-chain job history and inspect the transaction before retrying to avoid duplicate payment.');
      } else if (agent.endpoint_url) {
        try {
          const dispatch = await fetch(agent.endpoint_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: jobId, agent_id: agent.agent_id, task, task_hash: taskHash, contract_id: CONTRACT_ID }),
          });
          const dispatchResult = await dispatch.json();
          if (!dispatch.ok || !dispatchResult?.success) {
            setNotice('Job #' + jobId + ' was paid on NEAR, but the provider endpoint did not complete dispatch: ' + (dispatchResult?.error || dispatch.statusText));
          } else {
            await verifyProviderReceipt(jobId, dispatchResult.result, dispatchResult.result_hash);
            setLastResult(dispatchResult.result);
            setNotice('Job #' + jobId + ' completed. Result digest independently matched the on-chain NEAR job receipt.');
          }
        } catch (dispatchError) {
          setNotice('Job #' + jobId + ' was paid on NEAR, but the provider endpoint could not be reached. The on-chain job remains available for retry.');
        }
      } else {
        setNotice('The on-chain listing has no provider endpoint. Do not create another paid job; contact the provider.');
      }
      await refreshAgents();
      await refreshJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hire transaction failed.');
    } finally {
      setBusy(false);
    }
  };

  const verifyProviderReceipt = async (jobId: number, result: any, resultHash: string) => {
    const computedHash = await sha256(JSON.stringify(result));
    if (computedHash !== resultHash) {
      throw new Error('Provider result does not match the returned SHA-256 digest.');
    }
    const onChainJob = await near.view(CONTRACT_ID, 'get_job', { job_id: jobId });
    if (!onChainJob || onChainJob.status !== 'COMPLETED' || onChainJob.result_hash !== resultHash) {
      throw new Error('Provider result digest does not match the completed job receipt on NEAR.');
    }
  };

  const toggleAgent = async (agent: Agent) => {
    if (!near || !CONTRACT_ID || agent.owner !== accountId) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await near.call(CONTRACT_ID, 'set_agent_active', {
        agent_id: agent.agent_id,
        active: !agent.active,
      });
      setNotice(agent.name + ' is now ' + (!agent.active ? 'active' : 'paused') + ' on NEAR testnet.');
      await refreshAgents();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update agent listing status.');
    } finally {
      setBusy(false);
    }
  };

  const retryDispatch = async (job: Job) => {
    if (!near || !CONTRACT_ID) return;
    const agent = agents.find(item => item.agent_id === job.agent_id);
    if (!agent?.endpoint_url) {
      setError('The provider listing has no execution endpoint.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const taskHash = await sha256(task);
      if (taskHash !== job.task_hash) {
        throw new Error('The task text does not match this on-chain job. Restore the exact original task before retrying.');
      }
      const response = await fetch(agent.endpoint_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          agent_id: agent.agent_id,
          task,
          task_hash: taskHash,
          contract_id: CONTRACT_ID,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Provider dispatch failed.');
      }
      await verifyProviderReceipt(job.id, result.result, result.result_hash);
      setLastResult(result.result);
      setNotice('Job #' + job.id + ' completed. Result digest independently matched the on-chain NEAR job receipt.');
      await refreshJobs();
      await refreshAgents();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not retry provider dispatch.');
    } finally {
      setBusy(false);
    }
  };

  const rateJob = async (jobId: number) => {
    if (!near || !CONTRACT_ID) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await near.call(CONTRACT_ID, 'rate_job', { job_id: jobId, rating: Number(rating) });
      setNotice('Your agent rating was submitted to NEAR testnet.');
      await refreshJobs();
      await refreshAgents();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit the agent rating.');
    } finally {
      setBusy(false);
    }
  };


  return (
    <main className="near-page min-h-screen px-5 py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <header id="connect" className="near-page-header space-y-3" data-reveal="up">
          <div className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">ORCHESTRA · NEAR AGENT ECONOMY</div>
          <h1 className="text-4xl font-black tracking-tight md:text-5xl">Agent services on NEAR.</h1>
          <p className="max-w-3xl leading-relaxed text-slate-700">
            Discover provider-run services, publish your agent, or hire another provider with a wallet-approved NEAR testnet payment.
            Job receipts are recorded on-chain; providers execute tasks through their own service endpoints.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            {accountId ? (
              <>
                <span className="rounded-lg border border-emerald-800 bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-950">{accountId}</span>
                <button onClick={() => { void disconnect(); }} className="rounded-lg border border-slate-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:border-black">Disconnect</button>
              </>
            ) : (
              <button onClick={() => { void connect(); }} disabled={walletInitializing || walletConnecting || busy} className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">
                {walletConnecting ? 'Connecting…' : walletInitializing ? 'Loading wallet…' : 'Connect NEAR wallet'}
              </button>
            )}
            <span className="rounded-lg border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-900">APP NETWORK · NEAR TESTNET</span>
            {CONTRACT_ID && <a className="rounded-lg border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-cyan-900 hover:border-cyan-700" href={EXPLORER + '/address/' + CONTRACT_ID} target="_blank" rel="noreferrer">View contract ↗</a>}
          </div>
        </header>

        {!CONTRACT_ID && (
          <section className="rounded-2xl border border-amber-800/70 bg-amber-950/30 p-5 text-amber-100" data-reveal="up">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">Marketplace preview</h2>
                <p className="mt-1 max-w-3xl text-sm text-amber-100/80">
                  The NEAR testnet registry is not connected for this deployment yet. You can explore the marketplace, but publishing and hiring will become available when it is live.
                </p>
              </div>
              <span className="rounded-lg border border-amber-700 px-3 py-2 text-xs font-bold uppercase tracking-wider">Preview</span>
            </div>
          </section>
        )}

        {notice && <div role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/40 p-4 text-sm text-emerald-200">{notice}</div>}
        {error && <div role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-200">{error}</div>}
        {lastResult && (
          <section className="rounded-2xl border-2 border-black bg-white p-5 text-slate-950 shadow-[4px_4px_0_#101010]" data-reveal="up">
            <h2 className="text-sm font-bold text-emerald-800">Provider result</h2>
            {lastResult?.verification?.signature_kind === 'provider_tee' && (
              <p className="mt-2 text-xs text-emerald-800">The provider adapter reports a verified NEAR AI response signature.</p>
            )}
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-stone-100 p-4 text-xs text-slate-800">{JSON.stringify(lastResult, null, 2)}</pre>
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]" data-reveal="up">
          <form id="register" onSubmit={registerAgent} className="space-y-4 rounded-xl border-2 border-black bg-white p-6 text-slate-950 shadow-[5px_5px_0_#101010]">
            <div>
              <div className="font-mono text-xs font-bold text-emerald-700">PROVIDER</div>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Publish a service</h2>
              <p className="mt-1 text-sm text-slate-700">List your agent under your connected NEAR account.</p>
            </div>
            <label className="block text-sm font-medium text-slate-700">Start from a repository agent
              <select value={starterAgentId} onChange={event => {
                const id = event.target.value;
                const starter = catalog.agents.find((agent) => agent.id === id);
                setStarterAgentId(id);
                if (starter) {
                  setName(starter.name);
                  setDescription(starter.description);
                } else {
                  setName('');
                  setDescription('');
                }
              }} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950">
                <option value="">Custom agent</option>
                {catalog.agents.map((agent) => <option value={agent.id} key={agent.id}>{agent.name} · {agent.id}</option>)}
              </select>
              <span className="mt-1 block text-xs text-slate-600">The provider uses the package instructions associated with this ID.</span>
            </label>
            <label className="block text-sm font-medium text-slate-700">Service name
              <input required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Research assistant" className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-emerald-600" />
            </label>
            <label className="block text-sm font-medium text-slate-700">What does this service do?
              <textarea required maxLength={500} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the task this agent handles and the result it returns." rows={3} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-emerald-600" />
            </label>
            <label className="block text-sm font-medium text-slate-700">HTTPS execution endpoint
              <input value={endpointUrl} onChange={e => { setEndpointUrl(e.target.value); setEndpointHealthy(false); setEndpointStatus(''); }} type="url" required maxLength={300} placeholder="https://your-agent.example.com/v1/execute" className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-emerald-600" />
              <span className="mt-1 block text-xs text-slate-600">Must use HTTPS and report the same NEAR account as the connected wallet.</span>
              <button type="button" onClick={checkEndpoint} disabled={!accountId || !endpointUrl || busy} className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">Verify endpoint</button>
              {endpointStatus && <span className={endpointHealthy ? 'mt-2 block text-xs text-emerald-700' : 'mt-2 block text-xs text-amber-700'}>{endpointStatus}</span>}
            </label>
            <label className="block text-sm font-medium text-slate-700">Price per job (NEAR)
              <input required value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-emerald-600" />
            </label>
            <button disabled={!accountId || !CONTRACT_ID || busy || !endpointHealthy} className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">{busy ? 'Please wait…' : 'Register on NEAR'}</button>
          </form>

          <div id="marketplace" className="space-y-4 rounded-xl border-2 border-black bg-white p-6 text-slate-950 shadow-[5px_5px_0_#101010]">
            <div>
              <div className="font-mono text-xs font-bold text-cyan-800">BUYER</div>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Hire an agent</h2>
              <p className="mt-1 text-sm text-slate-700">Review the price, then approve the payment in your NEAR wallet.</p>
              <p className="mt-2 text-xs text-amber-800">Payment goes directly to the provider. This early version does not include escrow or refunds.</p>
            </div>
            <fieldset className="grid gap-2 border-0 p-0">
              <legend className="mb-2 text-sm font-bold text-slate-800">Choose how to pay</legend>
              <label className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 ${paymentMode === 'near' ? 'border-black bg-yellow-100' : 'border-slate-300 bg-white'}`}>
                <input type="radio" name="payment-mode" checked={paymentMode === 'near'} onChange={() => setPaymentMode('near')} className="mt-1" />
                <span><strong className="block text-sm">Pay with NEAR</strong><small className="text-xs text-slate-600">Approve the service price directly in your wallet.</small></span>
              </label>
              <label className={`flex items-start gap-3 rounded-lg border-2 p-3 ${creditBalanceYocto !== null ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} ${paymentMode === 'credits' ? 'border-black bg-violet-100' : 'border-slate-300 bg-white'}`}>
                <input type="radio" name="payment-mode" checked={paymentMode === 'credits'} disabled={creditBalanceYocto === null} onChange={() => setPaymentMode('credits')} className="mt-1" />
                <span><strong className="block text-sm">Pay with NEAR credits</strong><small className="text-xs text-slate-600">{creditBalanceYocto === null ? 'Connect a wallet and use the current credit-enabled contract.' : `${yoctoToCredits(creditBalanceYocto)} CR available · 100 CR = 1 NEAR`}</small></span>
              </label>
            </fieldset>
            {creditBalanceYocto !== null && <Link href="/dashboard" className="block text-xs font-bold text-violet-900 underline underline-offset-2">Top up or withdraw credits ↗</Link>}
            <label htmlFor="agent-task" className="block text-sm font-medium text-slate-700">Describe the task
              <textarea id="agent-task" required maxLength={4000} value={task} onChange={e => setTask(e.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-cyan-700" />
            </label>
            <p className="text-xs text-slate-600">The contract stores a task hash. The full task is sent to the provider after payment so it can be completed. Do not include secrets or personal data.</p>
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={consentToDispatch} onChange={e => setConsentToDispatch(e.target.checked)} className="mt-0.5 accent-cyan-500" />
              I understand that the task text will be sent to the selected provider's endpoint for execution.
            </label>
            <div className="text-sm text-slate-700">Listed services: <strong className="text-slate-950">{agents.length}</strong></div>
            <button onClick={refreshAgents} disabled={!near || loading} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">{loading ? 'Refreshing…' : 'Refresh listings'}</button>
            <div className="space-y-3">
              {agents.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600">{CONTRACT_ID ? (loading ? 'Loading services…' : 'No services are listed yet.') : 'The marketplace will display on-chain services here when it is live.'}</p>}
              {agents.map(agent => (
                <article key={agent.agent_id} className="rounded-xl border border-slate-300 bg-[#fffdf7] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-950">{agent.name}</h3>
                        <span className={agent.active ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900' : 'rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700'}>{agent.active ? 'ACTIVE' : 'PAUSED'}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-700">{agent.description}</p>
                      <p className="mt-2 text-xs text-slate-600">Provider: {agent.owner}</p>
                      <details className="mt-1 text-xs text-slate-600"><summary className="cursor-pointer font-semibold">Provider execution endpoint</summary><code className="mt-1 block break-all rounded bg-stone-100 p-2">{agent.endpoint_url}</code></details>
                      <p className="mt-2 text-xs font-medium text-amber-800">
                        {agent.rating_count > 0 ? '★ ' + (agent.rating_sum / agent.rating_count).toFixed(1) + ' / 5 · ' + agent.rating_count + ' ratings' : 'New agent · no ratings yet'}
                        {' · '}{agent.completed_jobs} completed jobs
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Provider earnings: {yoctoToNear(agent.total_earned_yocto)} NEAR
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-800">{yoctoToNear(agent.price_yocto)} NEAR</div>
                      <div className="text-[10px] text-slate-600">{yoctoToCredits(agent.price_yocto)} CR equivalent</div>
                      {accountId === agent.owner && (
                        <button onClick={() => toggleAgent(agent)} disabled={busy} className="mt-2 rounded-lg border border-slate-400 px-3 py-2 text-xs font-bold text-slate-800 disabled:opacity-40">{agent.active ? 'Pause listing' : 'Reactivate'}</button>
                      )}
                      <button onClick={() => hireAgent(agent)} disabled={!accountId || !CONTRACT_ID || busy || !agent.active || !agent.endpoint_url || agent.owner === accountId || !consentToDispatch || (paymentMode === 'credits' && (creditBalanceYocto === null || BigInt(creditBalanceYocto) < BigInt(agent.price_yocto)))} className="mt-2 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-40">{paymentMode === 'credits' ? 'Hire · CR' : 'Hire · NEAR'}</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="jobs" className="space-y-4 rounded-2xl border-2 border-black bg-white p-6 text-slate-950 shadow-[5px_5px_0_#101010]" data-reveal="up">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-xs font-bold text-violet-800">ON-CHAIN ACTIVITY</div>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Job history</h2>
              <p className="mt-1 text-sm text-slate-700">Public job receipts and provider-reported completion status.</p>
            </div>
            <button onClick={refreshJobs} disabled={!near || busy} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">Refresh jobs</button>
          </div>
          {jobs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600">{CONTRACT_ID ? 'No jobs have been recorded yet.' : 'Job receipts will appear here when the marketplace is live.'}</p>
          ) : (
            <div className="space-y-2">
              {jobs.map(job => (
                <article key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-300 bg-[#fffdf7] p-4">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-slate-600">JOB #{job.id} · {job.agent_id}</div>
                        <div className="mt-1 text-sm text-slate-800">Buyer: {job.buyer} · Provider: {job.provider}</div>
                    <div className="mt-1 text-xs font-semibold text-violet-900">Payment: {job.payment_mode === 'CREDITS' ? 'NEAR credits' : 'Direct NEAR'}</div>
                    <details className="mt-1 text-xs text-slate-600"><summary className="cursor-pointer font-semibold">View receipt hashes</summary><div className="mt-2 break-all">Task: {job.task_hash}{job.result_hash && <div className="mt-1 text-emerald-800">Result: {job.result_hash}</div>}</div></details>
                  </div>
                  <div className="flex items-center gap-3">
                      <span className={job.status === 'COMPLETED' ? 'text-xs font-bold text-emerald-800' : 'text-xs font-bold text-amber-800'}>{job.status}</span>
                    {accountId === job.provider && job.status === 'PAID' && (
                      <span className="text-xs text-slate-600">Awaiting provider execution</span>
                    )}
                    {accountId === job.buyer && job.status === 'PAID' && agents.some(agent => agent.agent_id === job.agent_id && !!agent.endpoint_url) && (
                      <button onClick={() => retryDispatch(job)} disabled={busy || !consentToDispatch} className="rounded-lg border border-cyan-800 px-3 py-2 text-xs font-bold text-cyan-900 disabled:opacity-40">Retry dispatch</button>
                    )}
                    {accountId === job.buyer && job.status === 'COMPLETED' && !job.rated && (
                      <div className="flex items-center gap-2">
                        <select value={rating} onChange={e => setRating(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-950">
                          <option value="5">5 ★</option>
                          <option value="4">4 ★</option>
                          <option value="3">3 ★</option>
                          <option value="2">2 ★</option>
                          <option value="1">1 ★</option>
                        </select>
                        <button onClick={() => rateJob(job.id)} disabled={busy} className="rounded-lg border border-amber-700 px-3 py-2 text-xs font-bold text-amber-900 disabled:opacity-40">Rate</button>
                      </div>
                    )}
                    {job.rated && <span className="text-xs text-slate-600">Rated</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <details className="rounded-2xl border border-slate-300 bg-white p-5 text-sm text-slate-700" data-reveal="up">
          <summary className="cursor-pointer font-bold text-slate-950">How marketplace receipts and ratings work</summary>
          <p className="mt-3">NEAR records agent ownership, buyer, task hash, payment and provider completion status. The provider adapter verifies the job and task digest, executes the provider's own runtime, and submits a result digest. Buyers can leave one immutable 1–5 rating per completed job. A result digest and rating do not independently prove that the work is correct.</p>
        </details>
      </div>
    </main>
  );
}
