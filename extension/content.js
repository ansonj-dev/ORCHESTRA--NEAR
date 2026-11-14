// Main-world WebMCP tools. Charges and extension storage are handled by bridge.js
// in the isolated world; this file never calls a remote billing endpoint.
(function () {
  if (window.__ORCHESTRA_EXTENSION_CLIENT__) return;
  window.__ORCHESTRA_EXTENSION_CLIENT__ = true;

  const registeredNames = new Set();
  const toolHandlers = new Map();
  let currentContext = null;
  let lastBilling = null;
  let requestSequence = 0;

  function extensionRequest(type, properties = {}) {
    return new Promise((resolve, reject) => {
      const requestId = `orchestra_${Date.now()}_${++requestSequence}`;
      const responseType = type === "REQUEST_STATE" ? "STATE_RESULT" : "CHARGE_RESULT";
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("The Orchestra extension bridge did not respond. Reload this page and try again."));
      }, 5000);
      function onMessage(event) {
        if (event.source !== window || event.origin !== location.origin) return;
        const message = event.data;
        if (message?.source !== "orchestra-extension" || message.type !== responseType || message.requestId !== requestId) return;
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        if (message.result?.success === false) reject(new Error(message.result.error || "Extension request failed."));
        else resolve(message.result);
      }
      window.addEventListener("message", onMessage);
      window.postMessage({ source: "orchestra-page", type, requestId, ...properties }, location.origin);
    });
  }

  function getModelContext() {
    const nativeContext = document.modelContext || navigator.modelContext;
    if (nativeContext && typeof nativeContext.registerTool === "function") return nativeContext;
    return null;
  }

  function ensureModelContext() {
    const nativeContext = getModelContext();
    if (nativeContext) return { ctx: nativeContext, source: "native WebMCP" };
    if (currentContext) return { ctx: currentContext, source: "Orchestra WebMCP development adapter" };

    const tools = new Map();
    currentContext = {
      _tools: tools,
      async registerTool(definition) {
        if (!definition?.name || typeof definition.execute !== "function") throw new Error("Invalid WebMCP tool definition.");
        tools.set(definition.name, definition);
        window.dispatchEvent(new CustomEvent("webmcp:tool-registered", { detail: { name: definition.name, description: definition.description } }));
        return true;
      },
      async unregisterTool(name) {
        const existed = tools.delete(name);
        if (existed) window.dispatchEvent(new CustomEvent("webmcp:tool-unregistered", { detail: { name } }));
        return existed;
      },
      async getTools() {
        return Array.from(tools.values(), ({ name, description, inputSchema }) => ({ name, description, inputSchema }));
      },
      async executeTool(name, args) {
        const tool = tools.get(name);
        if (!tool) throw new Error(`WebMCP tool '${name}' is not registered.`);
        return tool.execute(args || {});
      },
    };
    try { document.modelContext = currentContext; } catch { /* Some native pages expose a read-only property. */ }
    window.__ORCHESTRA_POLYFILL__ = currentContext;
    return { ctx: currentContext, source: "Orchestra WebMCP development adapter" };
  }

  function dispatchInput(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setFormValue(element, value) {
    if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
      element.checked = Boolean(value);
    } else if (element.isContentEditable) {
      element.textContent = String(value);
    } else {
      const descriptor = element instanceof HTMLTextAreaElement
        ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")
        : element instanceof HTMLSelectElement
          ? Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")
          : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      if (descriptor?.set) descriptor.set.call(element, String(value));
      else element.value = String(value);
    }
    dispatchInput(element);
  }

  const executors = {
    shopify_checkout_fast: async (args) => {
      const selectors = {
        fullName: 'input[name="fullName"], input[name="name"], #customer-name',
        email: 'input[name="email"], #customer-email',
        address: 'input[name="address"], #shipping-address',
      };
      const updated = [];
      for (const [key, selector] of Object.entries(selectors)) {
        const element = document.querySelector(selector);
        if (element && args[key] !== undefined) {
          setFormValue(element, args[key]);
          updated.push(key);
        }
      }
      if (!updated.length) throw new Error("No matching checkout fields were found. No form was submitted.");
      return { success: true, message: "Checkout fields filled. Review them before placing an order.", fieldsUpdated: updated, domain: location.hostname };
    },

    extract_analytics_table: async (args) => {
      const limit = Math.max(1, Math.min(50, Number(args.maxRows) || 10));
      const filter = String(args.filterMetric || "").trim().toLowerCase();
      const rows = Array.from(document.querySelectorAll("table tr, [data-analytics-row]"));
      const data = rows.map((row, index) => ({
        row: index + 1,
        content: Array.from(row.querySelectorAll("td, th, span"))
          .map((cell) => (cell.textContent || "").trim())
          .filter(Boolean)
          .join(" | "),
      })).filter((row) => row.content && (!filter || row.content.toLowerCase().includes(filter))).slice(0, limit);
      return { success: true, sourceOrigin: location.origin, rowCount: data.length, data, timestamp: new Date().toISOString() };
    },

    margin_context_editor: async (args) => {
      const content = String(args.patchContent || "");
      if (!content) throw new Error("Add patchContent before running the editor agent.");
      const editor = document.querySelector('[contenteditable="true"], textarea, #document-canvas');
      if (!editor) throw new Error("No editable text area was found on this page.");
      if (editor.isContentEditable) {
        const paragraph = document.createElement("p");
        paragraph.className = "orchestra-injected-patch";
        paragraph.textContent = content;
        editor.appendChild(paragraph);
        editor.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
        setFormValue(editor, `${editor.value}${editor.value ? "\n" : ""}${content}`);
      } else {
        editor.textContent = `${editor.textContent || ""}${editor.textContent ? "\n" : ""}${content}`;
        editor.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return { success: true, patchedChars: content.length, targetEditorFound: true };
    },

    browser_session_auditor: async (args) => {
      const inspect = args.checkLocalStorage !== false;
      const storageKeys = [];
      if (inspect) {
        for (const storageName of ["localStorage", "sessionStorage"]) {
          try {
            const storage = window[storageName];
            for (let index = 0; index < storage.length; index += 1) {
              const key = storage.key(index);
              if (key) storageKeys.push(key);
            }
          } catch { /* Storage may be blocked by the current origin. */ }
        }
      }
      const sensitiveNames = storageKeys.filter((key) => /token|secret|auth|session|credential/i.test(key));
      const cookieNames = args.deepScanCookies
        ? document.cookie.split(";").map((part) => part.trim().split("=")[0]).filter(Boolean)
        : [];
      return {
        success: true,
        origin: location.origin,
        storageKeysScanned: storageKeys.length,
        flaggedStorageKeyNames: sensitiveNames,
        visibleCookieNames: cookieNames,
        note: "Only storage and cookie names are inspected; values are never read or returned. HttpOnly cookies and cookie security flags are not visible to page scripts.",
      };
    },

    universal_form_syncer: async (args) => {
      const mapping = args.fieldMapping && typeof args.fieldMapping === "object" ? args.fieldMapping : {};
      const fields = Array.from(document.querySelectorAll("input:not([type='password']):not([type='file']):not([type='hidden']), textarea, select, [contenteditable='true']"));
      const updated = [];
      for (const [key, value] of Object.entries(mapping)) {
        if (value === undefined || value === null) continue;
        const target = fields.find((element) => {
          const label = element.labels ? Array.from(element.labels).map((item) => item.textContent || "").join(" ") : "";
          const names = [element.name, element.id, element.getAttribute("aria-label"), label].filter(Boolean);
          return names.some((name) => name.toLowerCase() === key.toLowerCase() || name.toLowerCase().includes(key.toLowerCase()));
        });
        if (target) {
          setFormValue(target, value);
          updated.push(key);
        }
      }
      return { success: true, matchedFields: updated.length, updatedFields: updated };
    },
  };

  function preflightTool(name, args) {
    if (name === "shopify_checkout_fast") {
      const targets = [
        ["fullName", 'input[name="fullName"], input[name="name"], #customer-name'],
        ["email", 'input[name="email"], #customer-email'],
        ["address", 'input[name="address"], #shipping-address'],
      ];
      if (!targets.some(([key, selector]) => args[key] !== undefined && document.querySelector(selector))) {
        throw new Error("No matching checkout fields and values were found. No credits were used.");
      }
    }
    if (name === "extract_analytics_table" && !document.querySelector("table tr, [data-analytics-row]")) {
      throw new Error("No analytics table was found on this page. No credits were used.");
    }
    if (name === "margin_context_editor" && (!args.patchContent || !document.querySelector('[contenteditable="true"], textarea, #document-canvas'))) {
      throw new Error("Add patchContent and open an editor before running this agent. No credits were used.");
    }
    if (name === "universal_form_syncer") {
      const mapping = args.fieldMapping && typeof args.fieldMapping === "object" ? args.fieldMapping : {};
      const fields = Array.from(document.querySelectorAll("input:not([type='password']):not([type='file']):not([type='hidden']), textarea, select, [contenteditable='true']"));
      const matched = Object.keys(mapping).some((key) => fields.some((element) => {
        const label = element.labels ? Array.from(element.labels).map((item) => item.textContent || "").join(" ") : "";
        return [element.name, element.id, element.getAttribute("aria-label"), label]
          .filter(Boolean)
          .some((value) => value.toLowerCase() === key.toLowerCase() || value.toLowerCase().includes(key.toLowerCase()));
      }));
      if (!matched) throw new Error("No matching form fields were found. No credits were used.");
    }
  }

  async function unregisterMissing(ctx, keepNames) {
    for (const name of Array.from(registeredNames)) {
      if (keepNames.has(name)) continue;
      if (typeof ctx.unregisterTool !== "function") continue;
      try { await ctx.unregisterTool(name); } catch (error) { console.warn("[Orchestra] Could not remove a stale tool", name, error); continue; }
      registeredNames.delete(name);
      toolHandlers.delete(name);
    }
  }

  async function refreshTools() {
    try {
      const state = await extensionRequest("REQUEST_STATE");
      if (!state?.enabled && registeredNames.size === 0) {
        window.__ORCHESTRA_WEBMCP__ = { version: "1.1.0", enabled: false, supportedTools: [], refreshTools };
        window.dispatchEvent(new CustomEvent("orchestra:extension-state", { detail: window.__ORCHESTRA_WEBMCP__ }));
        return;
      }
      const { ctx, source } = ensureModelContext();
      const available = state?.enabled && Array.isArray(state.tools) ? state.tools.filter((tool) => executors[tool.tool_name]) : [];
      const keepNames = new Set(available.map((tool) => tool.tool_name));
      await unregisterMissing(ctx, keepNames);

      for (const tool of available) {
        if (registeredNames.has(tool.tool_name)) continue;
        const execute = async (args = {}) => {
          preflightTool(tool.tool_name, args);
          const charge = await extensionRequest("CHARGE_TOOL", { toolName: tool.tool_name });
          const result = await executors[tool.tool_name](args);
          lastBilling = { toolName: tool.tool_name, cost: charge.cost, remainingBalance: charge.remainingBalance };
          const eventPayload = {
            ...lastBilling,
            result,
            timestamp: new Date().toISOString(),
            ledger: "local-extension-demo",
          };
          window.dispatchEvent(new CustomEvent("orchestra:tool-executed", { detail: eventPayload }));
          return result;
        };
        await ctx.registerTool({
          name: tool.tool_name,
          description: tool.description,
          inputSchema: tool.input_schema || { type: "object", properties: {} },
          execute,
        });
        toolHandlers.set(tool.tool_name, execute);
        registeredNames.add(tool.tool_name);
      }

      window.__ORCHESTRA_WEBMCP__ = {
        version: "1.1.0",
        activeModelContextSource: source,
        enabled: Boolean(state?.enabled),
        supportedTools: Array.from(registeredNames),
        demoBalance: Number(state?.balance || 0),
        runTool: async (name, args = {}) => {
          const execute = toolHandlers.get(name);
          if (!execute) throw new Error(`Agent '${name}' is not ready on this page.`);
          lastBilling = null;
          const result = await execute(args);
          return { result, billing: lastBilling };
        },
        refreshTools,
      };
      window.dispatchEvent(new CustomEvent("orchestra:extension-state", { detail: window.__ORCHESTRA_WEBMCP__ }));
    } catch (error) {
      console.warn("[Orchestra] Browser tools could not refresh:", error.message);
      window.__ORCHESTRA_WEBMCP__ = { version: "1.1.0", enabled: false, supportedTools: [], error: error.message, refreshTools };
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "orchestra-extension") return;
    if (event.data.type === "REFRESH_TOOLS") void refreshTools();
    if (event.data.type === "RUN_TOOL") {
      const { requestId, toolName, args } = event.data;
      Promise.resolve().then(() => {
        const runTool = window.__ORCHESTRA_WEBMCP__?.runTool;
        if (typeof runTool !== "function") throw new Error("Browser agents are still starting. Refresh the active page and try again.");
        return runTool(toolName, args || {});
      })
        .then((result) => window.postMessage({ source: "orchestra-page", type: "RUN_TOOL_RESULT", requestId, result }, location.origin))
        .catch((error) => window.postMessage({ source: "orchestra-page", type: "RUN_TOOL_RESULT", requestId, error: error?.message || "Agent execution failed." }, location.origin));
    }
  });
  window.addEventListener("orchestra:refresh-request", () => { void refreshTools(); });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { void refreshTools(); }, { once: true });
  else void refreshTools();
})();
