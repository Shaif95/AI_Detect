// Proving What Is Real: AI text check API.
//
// A small proxy in front of the team's self-hosted Hugging Face Space
// (chowdhuryshaif/deepfake-detector-inference, a private ZeroGPU Gradio
// Space) so the HF token stays server-side (set as the HF_TOKEN
// environment variable on Vercel). The Firefox add-on posts selected
// text here and gets back a verdict, an AI probability score, and the
// model name.
//
// Model: Hello-SimpleAI/chatgpt-detector-roberta, a RoBERTa classifier
// trained on the HC3 dataset of human answers and ChatGPT answers. It
// returns two labels, "Human" and "ChatGPT".
//
// The Space sleeps when idle. The first call wakes it and can take a
// while; if the wake outlasts this function, the caller gets a
// model_unavailable response and the next call succeeds.

const MODEL = "Hello-SimpleAI/chatgpt-detector-roberta";
const SPACE_URL = "https://chowdhuryshaif-deepfake-detector-inference.hf.space";
const MAX_CHARS = 4000;
const MIN_CHARS = 40;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callSpace(text, token) {
  const post = await fetch(SPACE_URL + "/gradio_api/call/predict_text", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data: [text] }),
    signal: AbortSignal.timeout(20000),
  });
  if (!post.ok) throw new Error("space_post_" + post.status);
  const posted = await post.json();
  const eventId = posted && posted.event_id;
  if (!eventId) throw new Error("space_no_event_id");

  const deadline = Date.now() + 35000;
  while (Date.now() < deadline) {
    const res = await fetch(SPACE_URL + "/gradio_api/call/predict_text/" + eventId, {
      headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.text();
    if (body.indexOf("event: complete") !== -1) {
      const line = body.split("\n").find((l) => l.indexOf("data:") === 0);
      if (!line) throw new Error("space_no_data");
      const data = JSON.parse(line.slice(5).trim());
      const rows = Array.isArray(data) ? data[0] : null;
      if (!Array.isArray(rows)) throw new Error("space_bad_rows");
      return rows;
    }
    if (body.indexOf("event: error") !== -1) throw new Error("space_error");
    await sleep(3000);
  }
  throw new Error("space_timeout");
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
    let rows;
    try {
      rows = await callSpace(clipped, token);
    } catch (firstErr) {
      // The Space may have been asleep; the first attempt wakes it.
      await sleep(3000);
      rows = await callSpace(clipped, token);
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
