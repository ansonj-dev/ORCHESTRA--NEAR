// Isolated-world bridge between the page's WebMCP tools and the extension worker.
(function () {
  if (globalThis.__ORCHESTRA_BRIDGE_INSTALLED__) return;
  globalThis.__ORCHESTRA_BRIDGE_INSTALLED__ = true;

  const APP_ORIGINS = new Set([
    "https://orchestra-web-gmvv.onrender.com",
  ]);

  const isTrustedAppOrigin = (origin) => APP_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "");

  function reply(event, requestId, result, type) {
    window.postMessage({
      source: "orchestra-extension",
      type,
      requestId,
      result,
    }, event.origin);
  }

  function send(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (result) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (!result?.success) reject(new Error(result?.error || "Extension request failed."));
        else resolve(result);
      });
    });
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data || typeof event.data !== "object") return;
    const message = event.data;

    if (message.source === "orchestra-page") {
      if (message.type === "REQUEST_STATE") {
        try {
          const result = await send({ type: "GET_PAGE_EXTENSION_STATE" });
          reply(event, message.requestId, result, "STATE_RESULT");
        } catch (error) {
          reply(event, message.requestId, { success: false, error: error.message }, "STATE_RESULT");
        }
      } else if (message.type === "CHARGE_TOOL") {
        try {
          const result = await send({ type: "CHARGE_BROWSER_TOOL", toolName: message.toolName });
          reply(event, message.requestId, result, "CHARGE_RESULT");
        } catch (error) {
          reply(event, message.requestId, { success: false, error: error.message }, "CHARGE_RESULT");
        }
      }
      return;
    }

    // The app uses postMessage because webpage JavaScript cannot call the
    // extension's private runtime API. Only the configured Orchestra origins
    // may write the synced tools and demo balance.
    if (message.source === "orchestra-app" && message.type === "SYNC_TO_EXTENSION" && isTrustedAppOrigin(event.origin)) {
      try {
        const result = await send({ type: "ORCHESTRA_MARKETPLACE_SYNC", payload: message.payload });
        reply(event, message.requestId, result, "SYNC_RESULT");
      } catch (error) {
        reply(event, message.requestId, { success: false, error: error.message }, "SYNC_RESULT");
      }
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "ORCHESTRA_REFRESH_TOOLS") {
      window.postMessage({ source: "orchestra-extension", type: "REFRESH_TOOLS" }, location.origin);
      sendResponse({ success: true });
      return false;
    }
    if (message?.type === "ORCHESTRA_RUN_TOOL") {
      const requestId = `orchestra_popup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", onResult);
        sendResponse({ success: false, error: "The agent did not respond. Refresh this page and try again." });
      }, 15000);
      function onResult(event) {
        if (event.source !== window || event.origin !== location.origin) return;
        const resultMessage = event.data;
        if (resultMessage?.source !== "orchestra-page" || resultMessage.type !== "RUN_TOOL_RESULT" || resultMessage.requestId !== requestId) return;
        window.clearTimeout(timeout);
        window.removeEventListener("message", onResult);
        if (resultMessage.error) sendResponse({ success: false, error: resultMessage.error });
        else sendResponse({ success: true, result: resultMessage.result });
      }
      window.addEventListener("message", onResult);
      window.postMessage({
        source: "orchestra-extension",
        type: "RUN_TOOL",
        requestId,
        toolName: message.toolName,
        args: message.args || {},
      }, location.origin);
      return true;
    }
  });
})();
