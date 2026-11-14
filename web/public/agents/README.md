# Orchestra starter agents

These packages are maintained in the repository and loaded by `examples/near-agent-provider`.

| Package ID | Responsibility | Instructions |
|---|---|---|
| `research-analyst` | Evidence-led analysis of the question and material supplied by a buyer | `research-analyst/system-prompt.md` |
| `contract-reviewer` | Focused review of supplied NEAR contract code and payment/state invariants | `contract-reviewer/system-prompt.md` |
| `data-analyst` | Careful analysis of buyer-supplied structured data | `data-analyst/system-prompt.md` |

The provider uses the selected package instructions with NEAR AI Cloud inference. A package becomes an available marketplace service only when a provider runs the adapter, registers the matching ID and HTTPS endpoint on the contract, and keeps that service online. The catalog is not a source of fake marketplace listings.

To publish one, choose its package on the Orchestra Agents page, run the provider adapter with a dedicated testnet account, and use the exact package ID in the Publish form. Keep the provider private key and NEAR AI API key in the provider host's secret manager.
