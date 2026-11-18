// Proving What Is Real: popup script.

const EXPLANATIONS = {
  likely_ai:
    "This text has patterns typical of AI-generated writing. Treat it as unverified until you can confirm it with the original source.",
  likely_human:
    "This text looks consistent with human writing. No detector is certain, so keep your normal verification habits.",
  uncertain:
    "The signals are mixed, and this check cannot call it either way. Verify it through the source before publishing or sharing.",
};

const HEADLINES = {
  likely_ai: "Likely AI-generated",
  likely_human: "Likely human-written",
  uncertain: "Uncertain: mixed signals",
};

const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const button = document.getElementById("check");
const textEl = document.getElementById("text");

async function refreshStatus() {
  const s = await browser.runtime.sendMessage({ type: "pwr-status" });
  if (s) statusEl.textContent = "Free checks left today: " + s.remaining + " of " + s.limit;
}

button.addEventListener("click", async () => {
  const text = textEl.value.trim();
  resultEl.textContent = "";
  if (text.length < 40) {
    resultEl.textContent = "Please paste at least a sentence or two (40 characters or more).";
    return;
  }
  button.disabled = true;
  button.textContent = "Checking...";
  try {
    const payload = await browser.runtime.sendMessage({ type: "pwr-check-popup", text: text });
    if (!payload) {
      resultEl.textContent = "Something went wrong. Please try again.";
    } else if (payload.state === "limit") {
      resultEl.innerHTML =
        "<span class='headline'>Daily free limit reached.</span> You have used today's " +
        payload.limit +
        " free checks. The limit resets tomorrow, or use the full detector at deepfakedetect.fyi.";
    } else if (payload.state === "error") {
      resultEl.textContent = payload.message || "The check failed. Please try again.";
    } else if (payload.state === "result") {
      const pct = Math.round((payload.ai_score || 0) * 100);
      resultEl.innerHTML =
        "<span class='headline'>" +
        (HEADLINES[payload.verdict] || "Result") +
        "</span> AI likelihood: " +
        pct +
        "%.<br>" +
        (EXPLANATIONS[payload.verdict] || "");
    }
  } catch (err) {
    resultEl.textContent = "Something went wrong. Please try again.";
  }
  button.disabled = false;
  button.textContent = "Check text";
  refreshStatus();
});

refreshStatus();
