// Orchestra extension service worker. The credit ledger here is a local demo ledger,
// deliberately separate from NEAR balances and on-chain transactions.
const BALANCE_KEY = "orchestraDemoCreditBalance";
const TOOLS_KEY = "orchestraSyncedTools";
const LAST_SYNC_KEY = "orchestraLastSyncedAt";
const APP_ORIGIN_KEY = "orchestraAppOrigin";
const TRANSACTIONS_KEY = "orchestraDemoTransactions";
const ENABLED_TABS_KEY = "orchestraEnabledTabs";
const SUPPORTED_TOOLS = new Set([
  "shopify_checkout_fast",
  "extract_analytics_table",
  "margin_context_editor",
  "browser_session_auditor",
  "universal_form_syncer",
]);
const APP_ORIGINS = new Set([
  "https://orchestra-web-gmvv.onrender.com",
]);

let creditQueue = Promise.resolve();

function get(area, key) {
  return new Promise((resolve) => chrome.storage[area].get(key, resolve));
}

function set(area, values) {
  return new Promise((resolve) => chrome.storage[area].set(values, resolve));
}

function extensionUi(sender) {
  return sender?.url?.startsWith(chrome.runtime.getURL(""));
}

function originOf(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

function isTrustedAppOrigin(origin) {
  return APP_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "");
}

function normalizeTool(raw) {
  const toolName = typeof raw === "string" ? raw : (raw?.tool_name || raw?.name);
  if (typeof toolName !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(toolName)) return null;
  let schema = raw?.input_schema ?? raw?.inputSchema ?? { type: "object", properties: {} };
  if (typeof schema === "string") {
    try { schema = JSON.parse(schema); } catch { schema = { type: "object", properties: {} }; }
  }
  const cost = Number(raw?.cost ?? 0.1);
  return {
    tool_name: toolName,
    title: String(raw?.title || raw?.tool_title || toolName.replaceAll("_", " ")).slice(0, 100),
    description: String(raw?.description || "Synced from the Orchestra marketplace.").slice(0, 500),
    cost: Number.isFinite(cost) && cost >= 0 ? Math.min(cost, 100) : 0.1,
    input_schema: schema && typeof schema === "object" ? schema : { type: "object", properties: {} },
    supported: SUPPORTED_TOOLS.has(toolName),
  };
}

async function initialize() {
  const state = await get("local", [BALANCE_KEY, TOOLS_KEY, TRANSACTIONS_KEY]);
  const updates = {};
  if (typeof state[BALANCE_KEY] !== "number") updates[BALANCE_KEY] = 0;
  if (!Array.isArray(state[TOOLS_KEY])) updates[TOOLS_KEY] = [];
  if (!Array.isArray(state[TRANSACTIONS_KEY])) updates[TRANSACTIONS_KEY] = [];
  if (Object.keys(updates).length) await set("local", updates);
  const session = await get("session", ENABLED_TABS_KEY);
  if (!session[ENABLED_TABS_KEY]) await set("session", { [ENABLED_TABS_KEY]: {} });
}

let initialization = initialize();
chrome.runtime.onInstalled.addListener(() => { initialization = initialize(); });
chrome.runtime.onStartup?.addListener(() => { initialization = initialize(); });

async function isEnabledFor(tabId, url) {
  if (!Number.isInteger(tabId)) return false;
  const origin = originOf(url);
  if (!origin) return false;
  const data = await get("session", ENABLED_TABS_KEY);
  const enabledTabs = data[ENABLED_TABS_KEY] || {};
  const key = String(tabId);
  if (enabledTabs[key] === origin) return true;
  if (enabledTabs[key]) {
    delete enabledTabs[key];
    await set("session", { [ENABLED_TABS_KEY]: enabledTabs });
  }
  return false;
}

function siteScriptIds(origin) {
  const slug = encodeURIComponent(origin).replace(/%/g, "_").replace(/[^a-zA-Z0-9_-]/g, "_");
  return { bridge: `orchestra_bridge_${slug}`, page: `orchestra_page_${slug}` };
}

async function registerSiteScripts(origin) {
  const ids = siteScriptIds(origin);
  const matches = [`${origin}/*`];
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [ids.bridge, ids.page] });
  const existingIds = new Set(existing.map((script) => script.id));
  const scripts = [];
  if (!existingIds.has(ids.bridge)) {
    scripts.push({
      id: ids.bridge,
      matches,
      js: ["bridge.js"],
      runAt: "document_start",
      world: "ISOLATED",
      persistAcrossSessions: false,
    });
  }
  if (!existingIds.has(ids.page)) {
    scripts.push({
      id: ids.page,
      matches,
      js: ["content.js"],
      runAt: "document_start",
      world: "MAIN",
      persistAcrossSessions: false,
    });
  }
  if (scripts.length) await chrome.scripting.registerContentScripts(scripts);
}

async function unregisterSiteScripts(origin) {
  const ids = siteScriptIds(origin);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [ids.bridge, ids.page] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map((script) => script.id) });
}

async function getPopupState() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  const [local, session] = await Promise.all([
    get("local", [BALANCE_KEY, TOOLS_KEY, LAST_SYNC_KEY, TRANSACTIONS_KEY, APP_ORIGIN_KEY]),
    get("session", ENABLED_TABS_KEY),
  ]);
  const tools = (local[TOOLS_KEY] || []).map(normalizeTool).filter(Boolean);
  const origin = originOf(tab?.url);
  const enabledTabs = session[ENABLED_TABS_KEY] || {};
  return {
    success: true,
    balance: Number(local[BALANCE_KEY] || 0),
    tools,
    supportedCount: tools.filter((tool) => tool.supported).length,
    lastSyncedAt: local[LAST_SYNC_KEY] || null,
    appOrigin: local[APP_ORIGIN_KEY] || "http://localhost:3000",
    transactions: local[TRANSACTIONS_KEY] || [],
    activeTabId: tab?.id ?? null,
    activeHost: origin ? new URL(origin).host : null,
    activeUrl: tab?.url || null,
    enabled: Boolean(tab?.id && origin && enabledTabs[String(tab.id)] === origin),
  };
}

async function notifyTab(tabId) {
  // Inject in order so an already-open page gets the isolated bridge before
  // the main-world WebMCP client, even on an app page with a bridge only.
  await chrome.scripting.executeScript({ target: { tabId }, files: ["bridge.js"], world: "ISOLATED" });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"], world: "MAIN" });
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "ORCHESTRA_REFRESH_TOOLS" }, (response) => {
      if (chrome.runtime.lastError) reject(new Error("Could not reach this page. Reload it, then try again."));
      else resolve(response || { success: true });
    });
  });
}

async function handleMessage(message, sender) {
  await initialization;
  if (!message || typeof message.type !== "string") return { success: false, error: "Unknown extension request." };

  if (message.type === "GET_EXTENSION_STATE") {
    if (!extensionUi(sender)) return { success: false, error: "This action is available from the extension popup." };
    return getPopupState();
  }

  if (message.type === "REFILL_CREDITS") {
    if (!extensionUi(sender)) return { success: false, error: "Open the extension popup to add demo credits." };
    const state = await get("local", BALANCE_KEY);
    const balance = Number(state[BALANCE_KEY] || 0) + 50;
    await set("local", { [BALANCE_KEY]: balance });
    return { success: true, balance };
  }

  if (message.type === "ORCHESTRA_MARKETPLACE_SYNC") {
    const appOrigin = originOf(sender.url);
    if (!extensionUi(sender) && !isTrustedAppOrigin(appOrigin)) {
      return { success: false, error: "Sync tools from the Orchestra app." };
    }
    const rawTools = Array.isArray(message.payload?.tools) ? message.payload.tools : [];
    const tools = rawTools.map(normalizeTool).filter(Boolean);
    const candidateBalance = Number(message.payload?.demoCreditBalance);
    const values = { [TOOLS_KEY]: tools, [LAST_SYNC_KEY]: new Date().toISOString() };
    if (isTrustedAppOrigin(appOrigin)) values[APP_ORIGIN_KEY] = appOrigin;
    if (Number.isFinite(candidateBalance) && candidateBalance >= 0) values[BALANCE_KEY] = candidateBalance;
    await set("local", values);
    return { success: true, tools: tools.length, supported: tools.filter((tool) => tool.supported).length };
  }

  if (message.type === "SET_ACTIVE_TAB_ENABLED") {
    if (!extensionUi(sender)) return { success: false, error: "Open the extension popup to enable a site." };
    const tabId = Number(message.tabId);
    if (!Number.isInteger(tabId)) return { success: false, error: "No active page is available." };
    const tab = await chrome.tabs.get(tabId);
    const origin = originOf(tab.url);
    if (!origin) return { success: false, error: "Orchestra tools work on regular HTTP or HTTPS pages." };
    const data = await get("session", ENABLED_TABS_KEY);
    const enabledTabs = data[ENABLED_TABS_KEY] || {};
    if (message.enabled) enabledTabs[String(tabId)] = origin;
    else delete enabledTabs[String(tabId)];
    await set("session", { [ENABLED_TABS_KEY]: enabledTabs });
    if (message.enabled) {
      try {
        await registerSiteScripts(origin);
        await notifyTab(tabId);
      } catch (error) {
        delete enabledTabs[String(tabId)];
        await set("session", { [ENABLED_TABS_KEY]: enabledTabs });
        throw error;
      }
    } else {
      try { await notifyTab(tabId); } catch { /* disabling still takes effect in the service worker */ }
      if (!Object.values(enabledTabs).includes(origin)) await unregisterSiteScripts(origin);
    }
    return { success: true, enabled: Boolean(message.enabled), host: new URL(origin).host };
  }

  if (message.type === "REFRESH_ACTIVE_TAB") {
    if (!extensionUi(sender)) return { success: false, error: "Open the extension popup to refresh a page." };
    const tab = await chrome.tabs.get(Number(message.tabId));
    if (!(await isEnabledFor(tab.id, tab.url))) {
      return { success: false, error: "Enable Orchestra for this site before refreshing its tools." };
    }
    await notifyTab(tab.id);
    return { success: true };
  }

  if (message.type === "RUN_BROWSER_TOOL") {
    if (!extensionUi(sender)) return { success: false, error: "Run agents from the extension popup." };
    const tab = await chrome.tabs.get(Number(message.tabId));
    if (!(await isEnabledFor(tab.id, tab.url))) throw new Error("Enable Orchestra on this site before running an agent.");
    const toolName = String(message.toolName || "");
    const data = await get("local", TOOLS_KEY);
    const tool = (data[TOOLS_KEY] || []).map(normalizeTool).find((entry) => entry?.tool_name === toolName);
    if (!tool?.supported) throw new Error("This agent is not available in the browser extension.");
    const args = message.args && typeof message.args === "object" && !Array.isArray(message.args) ? message.args : {};
    if (JSON.stringify(args).length > 20000) throw new Error("Agent arguments are too large. Keep them under 20 KB.");
    const execution = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { type: "ORCHESTRA_RUN_TOOL", toolName, args }, (response) => {
        if (chrome.runtime.lastError) reject(new Error("Could not reach the active page. Refresh it and try again."));
        else if (!response?.success) reject(new Error(response?.error || "Agent execution failed."));
        else resolve(response.result);
      });
    });
    return { success: true, execution };
  }

  if (message.type === "GET_PAGE_EXTENSION_STATE") {
    const tabId = sender.tab?.id;
    if (!(await isEnabledFor(tabId, sender.url))) return { success: true, enabled: false, tools: [] };
    const data = await get("local", [BALANCE_KEY, TOOLS_KEY]);
    return {
      success: true,
      enabled: true,
      balance: Number(data[BALANCE_KEY] || 0),
      tools: (data[TOOLS_KEY] || []).map(normalizeTool).filter((tool) => tool?.supported),
    };
  }

  if (message.type === "CHARGE_BROWSER_TOOL") {
    const tabId = sender.tab?.id;
    if (!(await isEnabledFor(tabId, sender.url))) throw new Error("Orchestra is not enabled for this site.");
    const toolName = String(message.toolName || "");
    const data = await get("local", [BALANCE_KEY, TOOLS_KEY]);
    const tool = (data[TOOLS_KEY] || []).map(normalizeTool).find((entry) => entry?.tool_name === toolName);
    if (!tool || !tool.supported) throw new Error("This agent is not available in the browser extension.");
    const operation = creditQueue.catch(() => undefined).then(async () => {
      const latest = await get("local", [BALANCE_KEY, TRANSACTIONS_KEY]);
      const balance = Number(latest[BALANCE_KEY] || 0);
      if (balance < tool.cost) throw new Error(`Not enough demo CR. Need ${tool.cost.toFixed(2)}; balance is ${balance.toFixed(2)}.`);
      const remaining = Math.round((balance - tool.cost) * 10000) / 10000;
      const transactions = Array.isArray(latest[TRANSACTIONS_KEY]) ? latest[TRANSACTIONS_KEY] : [];
      transactions.unshift({
        id: `ext_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        toolName,
        cost: tool.cost,
        remainingBalance: remaining,
        caller: "browser-extension-demo",
        status: "SUCCESS",
      });
      await set("local", { [BALANCE_KEY]: remaining, [TRANSACTIONS_KEY]: transactions.slice(0, 50) });
      return { success: true, remainingBalance: remaining, cost: tool.cost };
    });
    creditQueue = operation.catch(() => undefined);
    return operation;
  }

  return { success: false, error: "Unknown extension request." };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ success: false, error: error?.message || "Extension request failed." }));
  return true;
});
