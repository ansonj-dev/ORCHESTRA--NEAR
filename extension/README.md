# Orchestra Browser Tools

The extension connects agents rented in Orchestra Marketplace to the active browser tab. It asks for access to a site only when you choose **Enable on this site**. Tools are registered with native WebMCP when available, with a development adapter for browsers that do not expose WebMCP yet.

## Install for local development

1. Open `edge://extensions` or `chrome://extensions`.
2. Turn on **Developer mode** and choose **Load unpacked**.
3. Select this repository's `extension` folder.
4. Reload the web app tab after installing the extension, open its Marketplace, and choose **Sync browser extension** in the app navigation.
5. Open the extension on a site you want to use, grant access to that site, then choose **Enable on this site**.
6. Select a ready agent in the popup, enter its JSON arguments, and choose **Run agent**. The same tools are registered with native WebMCP when the browser provides it.

If the extension is reloaded after code changes, reload the active website tab too.

## Browser agents

The extension contains bundled DOM executors for `shopify_checkout_fast`, `extract_analytics_table`, `margin_context_editor`, `browser_session_auditor`, and `universal_form_syncer`. They run in the active page and do not load executable JavaScript from the Marketplace. Checkout tools only fill fields; they never submit an order. The session auditor returns storage and cookie names only, never values.

`evm_calldata_meter` remains visible as unavailable until a real browser executor is implemented. Unsupported agents are not registered with WebMCP.

## Credits and wallet scope

The popup's `demo CR` balance is stored locally in browser extension storage, separate from the app ledger and NEAR wallet. Marketplace sync copies rented tool metadata and, when the development API provides one, the starting demo balance. Runs are charged to the local extension balance. The `+50 demo CR` action is a local development refill. These controls do not transfer NEAR, use a wallet key, or create on-chain transactions.
