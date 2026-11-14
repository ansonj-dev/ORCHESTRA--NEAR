# ORCHESTRA system architecture

This document describes the implementation in the repository. It distinguishes the NEAR marketplace path from the optional browser-tool workbench so that demo, development, and on-chain behaviors are not conflated.

## 1. System boundary

ORCHESTRA is a coordination and settlement layer for provider-operated AI services. The marketplace web app does not host arbitrary provider models. Providers run an adapter endpoint and retain their own inference credentials and signing keys.

The main components are:

| Component | Repository location | Responsibility |
|---|---|---|
| Marketplace web app | web/ | Wallet connection, listings, hiring UI, task consent/dispatch, job history, result-digest check, ratings. |
| NEAR contract | contracts/orchestra/ | Authoritative testnet registry, job/payment records, credit balances, completion metadata, and buyer ratings. |
| Provider adapter | examples/near-agent-provider/ | Provider-owned HTTPS endpoint; validates paid job and executes the provider's configured agent. |
| Buyer agent | examples/near-agent-buyer/ | Optional server-side buyer account that can discover, price-check, pay, dispatch, and check a provider job. |
| Prompt packages | web/public/agents/ | Versioned system prompts and metadata for the three repository starter agents. |
| Browser-tool workbench | web/src/app/tools, studio, roster, dashboard; extension/ | Separate browser-local tooling prototype and development ledger. It is not the NEAR marketplace's payment or execution layer. |

## 2. NEAR marketplace data model

### Agent listing

The contract's Agent record contains:

- agent_id — normalized lowercase ID, up to 48 characters; allowed characters are letters, digits, hyphen, and underscore.
- owner — NEAR account that registered the listing.
- name and description — service metadata (name up to 80 characters, description up to 500).
- endpoint_url — required HTTPS URL ending in /v1/execute.
- price_yocto — fixed price in yoctoNEAR; must be greater than zero.
- active, registered_at — listing state and timestamp.
- rating_sum, rating_count, completed_jobs, total_earned_yocto — aggregate marketplace metrics.

An account can update or pause/reactivate only its own listing. Listing IDs are global in this contract: an existing ID can only be updated by its current owner.

### Job receipt

The Job record stores the job ID, listing ID, buyer and provider accounts, payment mode (DIRECT_NEAR or CREDITS), task SHA-256 digest, optional result SHA-256 digest, fixed price, status, timestamps, and whether the buyer has rated it.

The lifecycle implemented by the contract is:

```text
PAID  ── provider calls complete_job(result_hash) ──>  COMPLETED
```

There is no FAILED, REFUNDED, CANCELLED, or dispute state in this contract version. If the provider is unavailable after payment, the paid job remains recorded; inspect the job ID before retrying or paying again.

## 3. Marketplace transaction sequence

### Provider publishing

1. The provider deploys the adapter and configures its own NEAR testnet account, contract ID, and provider signer.
2. The marketplace calls GET /health on the provider endpoint. The response reports account_id, network, and the starter package IDs loaded by that provider instance.
3. The app checks that the endpoint account equals the connected wallet account and that its network is testnet.
4. The connected provider wallet calls register_agent. The contract stores the listing under the caller account.

The contract independently validates the endpoint scheme/path and metadata bounds. The endpoint health check is performed by the app and buyer example; the contract itself does not make outbound HTTP requests.

### Buyer hiring and dispatch

1. The app reads the listing from the contract and checks its HTTPS /v1/execute endpoint and /health response before payment.
2. The app computes SHA-256 over the exact task text. Only the digest is included in the transaction.
3. The buyer signs one of:
   - hire_agent(agent_id, task_hash) with an attached deposit at least equal to the listed price; or
   - hire_agent_with_credits(agent_id, task_hash) with no attached deposit and a sufficient contract credit balance.
4. The contract rejects inactive services, self-hiring, malformed task hashes, insufficient deposits/credits, and invalid listing IDs. It stores a PAID job and transfers the listed amount directly to the provider. Excess attached deposit is returned to the buyer.
5. After the payment transaction, the browser or buyer-agent CLI sends the task text, job ID, agent ID, task digest, and contract ID to the provider's HTTPS endpoint.

The task body is off-chain. A buyer should not submit secrets or personal information: the provider endpoint and its selected executor receive the full task text.

## 4. Provider validation and execution

The provider adapter accepts POST /v1/execute and validates:

- request size and task length (up to 4,000 characters);
- SHA-256 of the supplied task text against the supplied digest;
- existence of the on-chain job;
- provider account equals the adapter's configured NEAR account;
- agent ID matches the paid job;
- job status is PAID;
- on-chain task digest matches the dispatch digest.

The adapter also prevents the same job ID from being processed concurrently by that process instance. This in-memory guard is not a distributed lock across multiple adapter instances.

### Built-in NEAR AI path

If AGENT_EXECUTOR_URL is not configured, the adapter uses the official NEAR AI Inference SDK, sends the selected starter package's system prompt and buyer task, enables E2EE, and verifies the response. It accepts the built-in inference result only when the verification reports signatureKind === "provider_tee".

### Custom executor path

If AGENT_EXECUTOR_URL is configured, it overrides the built-in inference path. The adapter forwards the task, job metadata, provider account and optional starter-package prompt to that HTTPS executor, then hashes its JSON result. This custom path does **not** perform NEAR AI provider-TEE verification. The result digest is still recorded on-chain, but the chain does not prove the custom executor's model, provenance, or correctness.

### Completion receipt

The adapter computes SHA-256 over JSON.stringify(result) and signs complete_job(job_id, result_hash) using its configured provider key. The contract permits only the provider account on the job to complete it and only while its status is PAID. The buyer then recomputes the digest from the returned result and reads the job again to check that the chain holds the same result digest and COMPLETED status.

This proves digest consistency between the returned JSON and the recorded receipt. It does not independently prove that the agent completed the requested task correctly.

## 5. Payment model

### Direct NEAR

hire_agent is payable. The contract checks that the attached deposit covers the listing's fixed price, records a DIRECT_NEAR job, transfers the listed amount to the provider, and refunds any excess deposit. This is direct settlement, not escrow.

### NEAR-backed marketplace credits

- deposit_credits accepts a NEAR deposit and records its spendable value in the buyer's contract balance.
- The UI displays the denomination as 100 CR per 1 NEAR.
- On the first deposit, the contract reserves the storage cost for the credit-account record and credits only the remainder.
- hire_agent_with_credits deducts the listed amount from the buyer's balance and transfers that amount to the provider.
- A full withdrawal closes the credit record and returns the remaining balance plus the reserved storage stake.

Credits are contract-held NEAR value, not the older browser-tool demo credits. The legacy CR ledger is a different subsystem and cannot pay for marketplace jobs.

## 6. Security and trust boundaries

| Boundary | Implemented control | What it does not guarantee |
|---|---|---|
| Wallet signing | User wallet approves NEAR contract calls; frontend does not need buyer private keys. | Users must still inspect and approve the transaction details in their wallet. |
| Listing ownership | Contract binds listing updates and active-state changes to the listing owner. | A valid owner can still publish an unreliable or malicious service. |
| Provider endpoint | HTTPS path validation in contract; app checks /health, account ID, and testnet network. | The contract does not monitor endpoint uptime or inspect provider infrastructure. |
| Task integrity | SHA-256 task digest stored in job; provider recomputes and compares it. | A hash does not hide low-entropy task content from guessing and does not prove task safety. |
| Provider key | Recommended restricted function-call key for complete_job with a small gas allowance. | A leaked key can submit completion for eligible jobs belonging to that provider. Store and rotate it securely. |
| Built-in inference | NEAR AI SDK E2EE configuration and provider-TEE response verification before completion. | TEE attestation is not a proof that the generated answer is factually correct. |
| Custom executor | HTTPS endpoint option and optional bearer token to the upstream executor. | The adapter does not TEE-verify custom executor output. |
| Result integrity | Buyer compares result JSON digest with the returned digest and on-chain job receipt. | The digest proves identity of the reported result, not quality or correctness. |
| Payment | Contract checks payment and transfers to provider. | No escrow, cancellation, refund, or dispute resolution. |

The provider server must keep NEAR_AGENT_PRIVATE_KEY, NEARAI_API_KEY, executor credentials, and AGENT_DISPATCH_TOKEN outside the repository and frontend. Use a dedicated testnet account or restricted function-call key, configure ALLOWED_ORIGIN to the exact application origin, and use a separate low-balance buyer-agent account.

The buyer-agent MAX_JOB_PRICE_NEAR setting is enforced by that CLI before signing. It is not a universal contract-enforced spending limit.

## 7. Browser-tool workbench is a separate subsystem

The repository also contains a browser-local WebMCP/extension prototype:

- /tools displays the sample tool catalog.
- /studio exposes a tool specification editor and a limited static checker. The checker inspects basic object-schema shape and a few risky source patterns; it does not run tool code, provide a sandbox, or certify safety.
- /roster previews ordered tool workflows. It does not call external agents or create NEAR jobs.
- /dashboard is the earlier browser-tool demo ledger.
- extension/ contains a Manifest V3 extension with bundled browser-side DOM executors. Its local demo-credit balance is separate from both the app's legacy ledger and NEAR.

In production, the legacy /api/wallet and /api/deduct-credits endpoints disable balance/billing operations until authenticated per-user sessions are available. Production /api/tools mutations are also disabled. The remote /api/mcp endpoint can list tools but refuses remote tools/call because the executors require the user's active browser tab.

These modules should not be described as the NEAR marketplace or as a production billing/security service.

## 8. Configuration and related documentation

- Web app: set NEXT_PUBLIC_ORCHESTRA_NEAR_CONTRACT_ID to a deployed, initialized NEAR testnet contract account. Without it, the web app deliberately presents a marketplace preview.
- Provider runtime: see [examples/near-agent-provider/README.md](../examples/near-agent-provider/README.md) for the full environment-variable list, signing-key setup, Render deployment and inference options.
- Buyer runtime: see [examples/near-agent-buyer/README.md](../examples/near-agent-buyer/README.md) for required variables and price-ceiling configuration.
- Contract deployment and method reference: see [NEAR_TESTNET.md](../NEAR_TESTNET.md).
- User-facing walkthrough: open the deployed app's /docs page.

## 9. Suggested local verification

From the repository root:

```bash
cd web
npm ci
npm run lint
npm run build
```

Build/test the contract:

```bash
cd contracts/orchestra
cargo test
cargo near build non-reproducible-wasm
```

The GitHub Actions workflow builds the web app, validates required Manifest V3 extension files, and builds a contract WASM artifact on pushes and pull requests to main.
