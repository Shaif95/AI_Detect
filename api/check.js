// Proving What Is Real: AI text check API.
//
// A small proxy in front of a Hugging Face text-classification model so the
// HF token stays server-side (set as the HF_TOKEN environment variable on
// Vercel). The Firefox add-on posts selected text here and gets back a
// verdict, an AI probability score, and the model name.
//
// Model: Hello-SimpleAI/chatgpt-detector-roberta, a RoBERTa classifier
// trained on the HC3 dataset (human answers vs ChatGPT answers). It returns
// two labels, "Human" and "ChatGPT".

const MODEL = "Hello-SimpleAI/chatgpt-detector-roberta";
const HF_URL = "https://router.huggingface.co/hf-inference/models/" + MODEL;
const MAX_CHARS = 4000;
const MIN_CHARS = 40;

async function callModel(text, token) {
  return fetch(HF_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: text,
      options: { wait_for_model: true },
    }),
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, service: "proving-what-is-real", model: MODEL });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const token = process.env.HF_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "server_misconfigured", message: "The checker is not configured yet." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const text = body && typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < MIN_CHARS) {
    return res.status(400).json({
      error: "text_too_short",
      message: "Please check at least a sentence or two (40 characters or more).",
    });
  }
  const clipped = text.slice(0, MAX_CHARS);

  try {
    let hf = await callModel(clipped, token);
    if (hf.status === 503) {
      // Model is warming up. Wait once and retry.
      await new Promise((resolve) => setTimeout(resolve, 2500));
      hf = await callModel(clipped, token);
    }
    if (!hf.ok) {
      const detail = await hf.text();
      console.error("HF error", hf.status, detail.slice(0, 300));
      return res.status(502).json({ error: "model_unavailable", message: "The detection model is unavailable right now. Please try again in a moment." });
    }

    const data = await hf.json();
    const rows = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : data;
    if (!Array.isArray(rows)) {
      return res.status(502).json({ error: "unexpected_model_response" });
    }

    let ai = null;
    let human = null;
    for (const row of rows) {
      const label = String(row.label || "").toLowerCase();
      if (label.indexOf("chatgpt") !== -1 || label.indexOf("fake") !== -1 || label.indexOf("machine") !== -1) ai = row.score;
      else if (label.indexOf("human") !== -1 || label.indexOf("real") !== -1) human = row.score;
    }
    if (ai === null && human !== null) ai = 1 - human;
    if (ai === null) {
      return res.status(502).json({ error: "unexpected_model_response" });
    }
    if (human === null) human = 1 - ai;

    const verdict = ai >= 0.7 ? "likely_ai" : ai <= 0.3 ? "likely_human" : "uncertain";

    return res.status(200).json({
      verdict: verdict,
      ai_score: ai,
      human_score: human,
      model: MODEL,
    });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "model_unavailable", message: "The detection model is unavailable right now. Please try again in a moment." });
  }
};
