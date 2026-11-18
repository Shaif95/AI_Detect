// Proving What Is Real: content script.
//
// Renders a small floating verdict panel in the top-right corner of the
// page when the background script reports a check state. Uses a shadow
// root so page styles cannot leak in or out.

(function () {
  if (window.__pwrPanelLoaded) return;
  window.__pwrPanelLoaded = true;

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

  let host = null;
  let shadow = null;

  function ensurePanel() {
    if (host) return;
    host = document.createElement("div");
    host.id = "pwr-panel-host";
    host.style.cssText =
      "position:fixed;top:16px;right:16px;z-index:2147483647;width:330px;max-width:calc(100vw - 32px);";
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML =
      "<style>" +
      ".card{font-family:Georgia,serif;background:#ffffff;color:#1a1a1a;border:1px solid #d7d7d7;border-top:4px solid #0b5394;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,0.22);padding:14px 16px;}" +
      ".row{display:flex;justify-content:space-between;align-items:center;}" +
      ".brand{font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#0b5394;font-weight:bold;}" +
      ".close{border:none;background:none;font-size:18px;line-height:1;cursor:pointer;color:#666;padding:0 2px;}" +
      ".headline{font-size:18px;font-weight:bold;margin:8px 0 4px;}" +
      ".bar{height:8px;background:#eee;border-radius:4px;overflow:hidden;margin:8px 0 4px;}" +
      ".fill{height:100%;background:#0b5394;}" +
      ".fill.ai{background:#b3261e;}" +
      ".pct{font-size:12px;color:#555;margin:0 0 6px;}" +
      ".body{font-size:13.5px;line-height:1.5;margin:6px 0;}" +
      ".foot{font-size:11.5px;color:#777;margin-top:10px;border-top:1px solid #eee;padding-top:8px;line-height:1.5;}" +
      ".foot a{color:#0b5394;}" +
      "</style>" +
      '<div class="card" role="dialog" aria-label="AI text check result">' +
      '<div class="row"><span class="brand">AI Text Check</span>' +
      '<button class="close" title="Close" aria-label="Close">&times;</button></div>' +
      '<div class="content"></div>' +
      "</div>";
    shadow.querySelector(".close").addEventListener("click", hidePanel);
    document.documentElement.appendChild(host);
  }

  function hidePanel() {
    if (host) {
      host.remove();
      host = null;
      shadow = null;
    }
  }

  function setContent(html) {
    ensurePanel();
    shadow.querySelector(".content").innerHTML = html;
  }

  function show(payload) {
    if (!payload) return;
    if (payload.state === "loading") {
      setContent(
        '<p class="body">Checking this text against the detection model...</p>' +
          '<div class="foot">Proving What Is Real &middot; deepfakedetect.fyi</div>'
      );
      return;
    }
    if (payload.state === "limit") {
      setContent(
        '<div class="headline">Daily free limit reached</div>' +
          '<p class="body">You have used today\'s ' +
          payload.limit +
          ' free checks. The limit resets tomorrow. For more checks, use the full detector on our site.</p>' +
          '<div class="foot"><a href="https://www.deepfakedetect.fyi/" target="_blank" rel="noopener">Open deepfakedetect.fyi</a></div>'
      );
      return;
    }
    if (payload.state === "error") {
      setContent(
        '<div class="headline">Check failed</div>' +
          '<p class="body">' +
          (payload.message || "Something went wrong.") +
          "</p>" +
          '<div class="foot">Proving What Is Real &middot; deepfakedetect.fyi</div>'
      );
      return;
    }
    if (payload.state === "result") {
      const pct = Math.round((payload.ai_score || 0) * 100);
      const isAi = payload.verdict === "likely_ai";
      setContent(
        '<div class="headline">' +
          (HEADLINES[payload.verdict] || "Result") +
          "</div>" +
          '<div class="bar"><div class="fill' +
          (isAi ? " ai" : "") +
          '" style="width:' +
          pct +
          '%"></div></div>' +
          '<p class="pct">AI likelihood: ' +
          pct +
          "%</p>" +
          '<p class="body">' +
          (EXPLANATIONS[payload.verdict] || "") +
          "</p>" +
          '<div class="foot">Checks left today: ' +
          payload.remaining +
          " of " +
          payload.limit +
          " &middot; Model: " +
          (payload.model || "AI text detector") +
          "<br>Text you check is processed for the check and is not stored.</div>"
      );
    }
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "pwr-show") show(msg.payload);
  });
})();
