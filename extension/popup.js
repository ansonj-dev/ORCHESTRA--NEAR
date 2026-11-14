document.addEventListener("DOMContentLoaded", () => {
  const balanceDisplay = document.getElementById("wallet-display");
  const toolList = document.getElementById("tool-list");
  const toolCount = document.getElementById("tool-count");
  const enableButton = document.getElementById("btn-enable");
  const refillButton = document.getElementById("btn-refill");
  const refreshButton = document.getElementById("btn-refresh");
  const siteName = document.getElementById("site-name");
  const siteState = document.getElementById("site-state");
  const siteDot = document.getElementById("site-dot");
  const notice = document.getElementById("notice");
  const runnerTool = document.getElementById("runner-tool");
  const runnerArgs = document.getElementById("runner-args");
  const runnerHelp = document.getElementById("runner-help");
  const runButton = document.getElementById("btn-run");
  const runnerResult = document.getElementById("runner-result");
  let currentState = null;
  enableButton.disabled = true;
  refreshButton.disabled = true;

  function message(type, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        reject(new Error("Load Orchestra as an unpacked browser extension to use these controls."));
        return;
      }
      chrome.runtime.sendMessage({ type, ...payload }, (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (!response?.success) reject(new Error(response?.error || "The extension request failed."));
        else resolve(response);
      });
    });
  }

  function showNotice(text, isError = false) {
    notice.textContent = text || "";
    notice.classList.toggle("error", isError);
  }

  function updateRunner() {
    const state = currentState;
    const tool = state?.tools?.find((item) => item.tool_name === runnerTool.value && item.supported);
    runButton.disabled = !state?.enabled || !tool;
    if (!tool) {
      runnerHelp.textContent = state?.enabled ? "Sync at least one supported browser agent from the Orchestra app." : "Enable this site before running an agent.";
      return;
    }
    const required = tool.input_schema?.required || [];
    runnerHelp.textContent = required.length
      ? `Required arguments: ${required.join(", ")} · ${Number(tool.cost || 0).toFixed(2)} demo CR per run`
      : `${Number(tool.cost || 0).toFixed(2)} demo CR per run · Arguments must be a JSON object.`;
  }

  function renderTools(tools, state) {
    toolList.replaceChildren();
    const previousSelection = runnerTool.value;
    const runnable = tools.filter((tool) => tool.supported);
    runnerTool.replaceChildren();
    if (!runnable.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No supported agents synced";
      runnerTool.append(option);
    } else {
      for (const tool of runnable) {
        const option = document.createElement("option");
        option.value = tool.tool_name;
        option.textContent = tool.title || tool.tool_name;
        runnerTool.append(option);
      }
      runnerTool.value = runnable.some((tool) => tool.tool_name === previousSelection) ? previousSelection : runnable[0].tool_name;
    }
    updateRunner();
    if (!tools.length) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "No agents synced yet. Open Orchestra Marketplace and choose “Sync browser extension”.";
      toolList.append(empty);
      toolCount.textContent = state.lastSyncedAt ? "0 synced" : "Waiting for app sync";
      return;
    }

    const supported = tools.filter((tool) => tool.supported).length;
    toolCount.textContent = `${supported} ready · ${tools.length} synced`;
    tools.forEach((tool, index) => {
      const item = document.createElement("li");
      item.className = "tool";
      item.style.animationDelay = `${Math.min(index * 35, 175)}ms`;
      const icon = document.createElement("span");
      icon.className = "tool-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = tool.supported ? "✳" : "…";
      const copy = document.createElement("div");
      copy.className = "tool-copy";
      const title = document.createElement("div");
      title.className = "tool-title";
      title.textContent = tool.title || tool.tool_name;
      const name = document.createElement("div");
      name.className = "tool-name";
      name.textContent = `${tool.tool_name} · ${Number(tool.cost || 0).toFixed(2)} CR / run`;
      copy.append(title, name);
      const status = document.createElement("span");
      status.className = `tool-status${tool.supported ? "" : " unsupported"}`;
      status.textContent = tool.supported ? "Ready" : "Not available";
      status.title = tool.supported ? "Implemented in this extension" : "This agent has no browser executor in the extension yet";
      item.append(icon, copy, status);
      toolList.append(item);
    });
  }

  async function refreshState() {
    try {
      const state = await message("GET_EXTENSION_STATE");
      currentState = state;
      balanceDisplay.textContent = Number(state.balance || 0).toFixed(2);
      siteName.textContent = state.activeHost || "No supported active page";
      siteName.title = state.activeUrl || "";
      for (const link of document.querySelectorAll("[data-app-route]")) {
        link.href = new URL(link.getAttribute("data-app-route"), state.appOrigin || "http://localhost:3000").toString();
      }
      siteState.textContent = state.enabled ? "ON" : "OFF";
      siteDot.classList.toggle("on", state.enabled);
      enableButton.textContent = state.enabled ? "Pause on this site" : "Enable on this site";
      enableButton.disabled = !state.activeTabId || !state.activeHost;
      refreshButton.disabled = !state.enabled;
      renderTools(state.tools || [], state);
      if (!notice.classList.contains("error")) showNotice("");
      return state;
    } catch (error) {
      currentState = null;
      enableButton.disabled = true;
      refreshButton.disabled = true;
      toolList.replaceChildren();
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "This is a preview. Install the extension in Edge or Chrome to connect a tab.";
      toolList.append(empty);
      toolCount.textContent = "Extension preview";
      siteName.textContent = "Browser extension not active";
      siteState.textContent = "PREVIEW";
      updateRunner();
      showNotice(error.message, true);
      return null;
    }
  }

  enableButton.addEventListener("click", async () => {
    enableButton.disabled = true;
    try {
      const state = currentState || await message("GET_EXTENSION_STATE");
      if (!state.enabled) {
        const origin = new URL(state.activeUrl).origin;
        const allowed = await chrome.permissions.request({ origins: [`${origin}/*`] });
        if (!allowed) throw new Error(`Permission for ${new URL(origin).host} was not granted.`);
      }
      const result = await message("SET_ACTIVE_TAB_ENABLED", { tabId: state.activeTabId, enabled: !state.enabled });
      showNotice(result.enabled ? `Agents are ready on ${result.host}.` : `Agents paused on ${result.host}.`);
      await refreshState();
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      enableButton.disabled = !currentState?.activeTabId || !currentState?.activeHost;
    }
  });

  refillButton.addEventListener("click", async () => {
    refillButton.disabled = true;
    try {
      const result = await message("REFILL_CREDITS");
      balanceDisplay.textContent = Number(result.balance).toFixed(2);
      showNotice("Added 50 local demo CR. This does not use NEAR.");
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      refillButton.disabled = false;
    }
  });

  refreshButton.addEventListener("click", async () => {
    refreshButton.disabled = true;
    try {
      const state = await message("GET_EXTENSION_STATE");
      await message("REFRESH_ACTIVE_TAB", { tabId: state.activeTabId });
      showNotice("Active page refreshed with the latest supported agents.");
      await refreshState();
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      refreshButton.disabled = !currentState?.enabled;
    }
  });

  runnerTool.addEventListener("change", updateRunner);

  runButton.addEventListener("click", async () => {
    runButton.disabled = true;
    runnerResult.hidden = true;
    try {
      const state = currentState || await message("GET_EXTENSION_STATE");
      if (!state.enabled) throw new Error("Enable Orchestra on this site before running an agent.");
      const args = JSON.parse(runnerArgs.value || "{}");
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Arguments must be a JSON object.");
      const response = await message("RUN_BROWSER_TOOL", {
        tabId: state.activeTabId,
        toolName: runnerTool.value,
        args,
      });
      const output = response.execution;
      runnerResult.textContent = JSON.stringify(output?.result ?? output, null, 2) || "Agent completed.";
      runnerResult.hidden = false;
      await refreshState();
      const billing = output?.billing;
      showNotice(billing
        ? `Agent completed · ${Number(billing.cost).toFixed(2)} demo CR used · ${Number(billing.remainingBalance).toFixed(2)} left.`
        : "Agent completed.");
    } catch (error) {
      runnerResult.textContent = error.message;
      runnerResult.hidden = false;
      showNotice(error.message, true);
    } finally {
      updateRunner();
    }
  });

  void refreshState();
});
