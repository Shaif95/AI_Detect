// Proving What Is Real: background script.
//
// Adds a right-click menu item on selected text, enforces the free-check
// guardrail (5 checks per day), calls the checker API, and tells the
// content script to show the verdict panel. Also answers the popup.

const API_URL = "https://ai-detect-api.vercel.app/api/check";
const DAILY_LIMIT = 5;
const MENU_ID = "pwr-check-selection";

browser.contextMenus.create({
  id: MENU_ID,
  title: "Check if this text is AI-generated",
  contexts: ["selection"],
});

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function getGuard() {
  const data = await browser.storage.local.get("pwrGuard");
  const g = data.pwrGuard;
  if (!g || g.day !== todayKey() || typeof g.count !== "number") {
    return { day: todayKey(), count: 0 };
  }
  return g;
}

async function bumpGuard() {
  const g = await getGuard();
  g.count += 1;
  await browser.storage.local.set({ pwrGuard: g });
  return g;
}

function sendToTab(tabId, payload) {
  if (tabId === null || tabId === undefined) return;
  browser.tabs.sendMessage(tabId, { type: "pwr-show", payload: payload }).catch(() => {});
}

function friendlyError(data, status) {
  if (data && data.message) return data.message;
  if (status === 400) return "That text is too short to check. Select at least a sentence or two.";
  return "The checker could not complete this check. Please try again in a moment.";
}

async function runCheck(text, tabId) {
  const guard = await getGuard();
  if (guard.count >= DAILY_LIMIT) {
    const payload = { state: "limit", limit: DAILY_LIMIT };
    sendToTab(tabId, payload);
    return payload;
  }

  await bumpGuard();
  sendToTab(tabId, { state: "loading" });

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const payload = { state: "error", message: friendlyError(data, response.status) };
      sendToTab(tabId, payload);
      return payload;
    }
    const after = await getGuard();
    const payload = {
      state: "result",
      verdict: data.verdict,
      ai_score: data.ai_score,
      model: data.model,
      remaining: Math.max(0, DAILY_LIMIT - after.count),
      limit: DAILY_LIMIT,
    };
    sendToTab(tabId, payload);
    return payload;
  } catch (err) {
    const payload = {
      state: "error",
      message: "Could not reach the checker. Please check your connection and try again.",
    };
    sendToTab(tabId, payload);
    return payload;
  }
}

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && info.selectionText && tab) {
    runCheck(info.selectionText, tab.id);
  }
});

browser.runtime.onMessage.addListener((msg) => {
  if (!msg) return undefined;
  if (msg.type === "pwr-check-popup" && typeof msg.text === "string") {
    return runCheck(msg.text, null);
  }
  if (msg.type === "pwr-status") {
    return getGuard().then((g) => ({
      count: g.count,
      limit: DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - g.count),
    }));
  }
  return undefined;
});
