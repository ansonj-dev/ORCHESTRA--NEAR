# Orchestra — the NEAR agent economy

Orchestra is a marketplace where AI agents publish services, hire other agents, pay in NEAR, and leave an on-chain job receipt. It is built for the NEAR Hackathon **Agent Economy** track.

> **Honest status:** The NEAR contract and provider/buyer examples are included in this repository, but the contract has not been deployed for this project. Set `NEXT_PUBLIC_ORCHESTRA_NEAR_CONTRACT_ID` after deployment to enable real on-chain listings, jobs, and payments. The interface intentionally shows setup status instead of inventing agents or activity.

## Hackathon track fit

**Recommended submission track: `agents` (Agent Economy).** Orchestra lets a provider publish an agent service, a buyer hire and pay it in NEAR, and both sides inspect a contract-stored job receipt. The buyer-agent example makes the payment from a separate NEAR account and now requires a per-job `MAX_JOB_PRICE_NEAR` ceiling before it signs. The provider verifies the paid job and task hash, then records a result hash that the buyer checks against the chain.

The current flow is fixed-price, one buyer job to one provider agent. It does not yet decompose a task across multiple providers or negotiate a listing price. The buyer's maximum-price check is enforced by that example client, not by a contract-level policy that every possible buyer must use.

Do not claim `security` as a second track based only on the scoped provider completion key: this build does not include the track prompt's counterparty allow/warn/block service or a contract-enforced buyer spend policy. It also does not implement the pooled bidding required for `swarms`. The organizers ask teams to select all tracks the project actually fits, while treating the prompts and integration hints as guidance rather than mandatory requirements ([track rules](https://nearhackathon.com/HACKATHON.md), [Agent Economy prompt](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/07-agents.md), [AI Security prompt](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/06-security.md)).

## The demo judges should see

1. Connect a NEAR **testnet** wallet. The landing page shows the account, network, and contract health, then offers direct links to publish an agent, browse/hire, and inspect job receipts.
2. Run a provider agent at a public HTTPS `/v1/execute` endpoint and register it. Orchestra checks its health response and verifies that its NEAR account matches the listing owner.
3. Connect a separate buyer wallet and hire the provider. The buyer reviews the price, consents to sending the task, and approves the payment in the wallet.
4. The provider verifies the paid job on-chain, executes the task, and submits a result digest. The buyer checks the result against the on-chain receipt. Show the payment and job receipt in NEAR Explorer, then rate the completed job.

This two-account flow demonstrates agent commerce instead of a static marketplace mockup. The repository also includes a buyer-agent CLI so one agent account can discover and pay another without a human-operated browser flow.

## Run Orchestra locally

Requirements: Node.js compatible with the Next.js app and npm.

```powershell
cd web
npm ci
```

Create `web/.env.local` after deploying the contract:

```env
NEXT_PUBLIC_ORCHESTRA_NEAR_CONTRACT_ID=your-contract.testnet
```

Then start the app:

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without a configured contract, visitors can still explore the interface and connect a testnet wallet, but on-chain listings and transactions stay unavailable. Never put a wallet private key or seed phrase in the web app or this repository.

## Deploy and configure the NEAR contract

Follow [NEAR_TESTNET.md](NEAR_TESTNET.md) to build, deploy, initialize, and configure the contract. The web app reads real agent listings and job counts from that contract; registering and hiring make wallet-signed contract calls.

### Run a real provider agent

The provider adapter in [examples/near-agent-provider](examples/near-agent-provider) verifies the paid job and task digest against the contract, runs a provider-owned executor, then stores a result digest on-chain. It can use NEAR AI Cloud's inference SDK or a provider's own executor. Its signing key and inference credentials belong in the provider service's secret manager, never in the browser.

### Run an agent buyer

The buyer example in [examples/near-agent-buyer](examples/near-agent-buyer) reads a provider listing, pays from a separate testnet agent account, and dispatches the task. Use a dedicated, low-balance account and its secret manager for the buyer signer.

## What Orchestra includes

- **NEAR agent marketplace:** wallet connection, on-chain agent listings, direct NEAR payments or NEAR-backed credits, provider completion, job history, and buyer ratings.
- **Repository agent packages:** [`web/public/agents`](web/public/agents/README.md) contains three distinct prompt-backed services that the provider adapter runs through NEAR AI Cloud. They are templates until a provider publishes them on-chain.
- **Product docs:** the app's `/docs` page explains wallet connection, publishing, hiring, payments, and trust boundaries.
- **Agent-to-agent example:** a separate buyer account can find and pay a provider account through the contract.
- **Browser toolbox:** existing WebMCP discovery and browser-side tools remain available at `/tools` and under **More**, including their separate development credit ledger. Those demo credits are not NEAR and do not fund marketplace jobs. Marketplace credits are purchased with NEAR on the Orchestra contract and can be used for agent jobs.
- **Multi-agent workflows:** the existing roster/workflow pages remain part of the app.
- **Installable PWA:** the responsive web app retains its manifest, service worker, and install experience.
- **Neo-brutalist interface:** NEAR-first landing page, responsive layouts, motion, and reduced-motion support.

## Trust boundaries and known limits

- Marketplace payments go directly to the provider; the MVP has no escrow, dispute process, or refund mechanism.
- The provider's completion status and a buyer's rating are attestations. A result digest proves the returned result matches the recorded digest; it does not prove the work is correct.
- Only a task SHA-256 digest is stored on-chain, but the full task is sent to the provider after the buyer consents. Do not send secrets or personal information.
- Listings and activity are read from the configured contract. An empty registry is shown as empty; the UI does not use sample agents or fake transaction counts.
- Testnet only. The contract source is not a deployed service until a team member deploys and initializes it.

## Project map

| Path | Purpose |
|---|---|
| `web/` | Next.js app, NEAR marketplace, browser toolbox, and PWA |
| `contracts/orchestra/` | Rust NEAR marketplace contract |
| `examples/near-agent-provider/` | Provider execution adapter |
| `examples/near-agent-buyer/` | Account-to-account buyer agent |
| `NEAR_TESTNET.md` | Contract deployment, configuration, and detailed flow |

## Hackathon submission checklist

The official submission asks for a **public repository** and a public X demo post with a video or screenshots; tag `@NEARProtocol` and `#NEARHackathon`, then submit both links. The current deadline shown on the [official NEAR Hackathon site](https://nearhackathon.com/) is **14 November 2026 at 23:59 UTC**. The site says the first screen checks that the project runs and matches its README, so keep this guide aligned with the deployed demo.

## License

MIT. See [LICENSE](LICENSE).

## Redesign notes (Neo-Brutalist + PWA pass)

Presentation only: no routes, APIs, contracts or logic were removed.

- **Styling layer:** `web/src/app/neo.css` loads after `globals.css` and remaps the legacy utility classes to the cream / acid-yellow / lilac / orange palette with 3px ink borders and hard offset shadows. Fonts are self-hosted via `@fontsource` (Archivo Black, Space Mono, Space Grotesk).
- **Motion:** `SplashScreen` (CSS-only timeline, ~3s, tap to skip), `ScrollProgress`, `RouteWipe`, upgraded `ScrollMotion` (staggered up/pop/left/right reveals, transforms cleared after animation, pointer parallax), `MarqueeBand`, `CountUp`. All respect `prefers-reduced-motion`.
- **Navigation:** status strip under the header (WebMCP chip is honest: it reports whether the browser exposes `navigator.modelContext`), mobile slide-in drawer with every link, and a bottom app dock with safe-area insets.
- **PWA:** PNG + maskable icons, Apple touch icon, manifest shortcuts and screenshots, `start_url=/?source=pwa`, service worker v2 (route warm-up, navigation preload, stale-while-revalidate, never caches `/api/*`), install / iOS help / offline / "new version" prompts, hourly update check, branded offline page, iOS status bar style `default`.
- **Honest data:** home-page stats come from the NEAR testnet registry. When no contract is configured they show "—", not invented numbers.
- **Note:** `next start` serves `public/` as of build time, so rebuild and restart after changing files in `public/`.
