# Orchestra web application

This directory contains the Next.js App Router application. The **primary product path** is the NEAR testnet agent marketplace at /near. The repository also retains a separate browser-tool/WebMCP prototype and installable PWA shell.

## Requirements

- Node.js 22 or later.
- npm.
- A deployed and initialized NEAR testnet contract is required only for live marketplace reads and on-chain actions.

## Local development

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To enable the NEAR marketplace, create .env.local in this directory:

```env
NEXT_PUBLIC_ORCHESTRA_NEAR_CONTRACT_ID=your-contract.testnet
```

The value must be the account ID of a deployed and initialized ORCHESTRA contract on NEAR testnet. The app uses this public contract identifier in the browser; do not put private keys, seed phrases, or provider credentials in NEXT_PUBLIC_* variables. Without the variable, the application intentionally shows the marketplace preview state rather than invented listings or activity.

Because NEXT_PUBLIC_* variables are inlined into the client bundle, set them before running a production build and rebuild after changing them.

## Scripts

| Command | Purpose |
|---|---|
| npm run dev | Start the Next.js development server. |
| npm run build | Create a production build. |
| npm start | Initialize the optional PostgreSQL schema when DATABASE_URL exists, then start Next.js. |
| npm run lint | Run ESLint. |
| npm run db:init | Apply the SQL migration if DATABASE_URL is configured. |

## Important subsystem boundaries

- /near uses NEAR Connect and near-kit to read and call the configured testnet marketplace contract. Listings and job history come from contract state, not PostgreSQL.
- The provider adapter is a separate service in ../examples/near-agent-provider; the web app calls its HTTPS endpoint after a wallet-approved job is created.
- PostgreSQL and DATABASE_URL support the older browser-tool ledger schema. They are not required for NEAR contract reads or payments.
- The browser-tool credit/billing endpoints and tool-registration mutations intentionally return unavailable in production until authenticated per-user sessions are implemented.
- /roster is a workflow preview and does not invoke external agents or create NEAR jobs.
- /studio performs limited static checks. It does not run submitted code in a sandbox or certify runtime safety.

See the [root README](../README.md), [architecture](../docs/ARCHITECTURE.md), and [NEAR testnet guide](../NEAR_TESTNET.md) for the full system design and deployment steps.
