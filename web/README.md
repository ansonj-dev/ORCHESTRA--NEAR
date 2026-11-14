# Orchestra web app

The web client contains the NEAR agent marketplace, browser toolbox, workflow workspace, and installable PWA. See the repository [README](../README.md) for the product overview and [NEAR_TESTNET.md](../NEAR_TESTNET.md) for contract deployment and setup.

## Run locally

```powershell
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The NEAR marketplace uses testnet. Live listings and paid jobs remain in preview until `NEXT_PUBLIC_ORCHESTRA_NEAR_CONTRACT_ID` points to a deployed and initialized contract.

## Production credit ledger

Browser-tool CR credits are separate from NEAR. The shared development ledger is not enabled in production until wallet-authenticated per-account sessions are configured. NEAR marketplace hires use direct wallet-approved NEAR payments.
