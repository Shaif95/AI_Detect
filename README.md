# Proving What Is Real: AI Text Check

A Firefox add-on that checks whether selected text was likely written by AI, built for local journalists and community fact-checkers. It supports the team's Mozilla Foundation Human-Scale AI Incubator application, "Proving What Is Real: Detection of AI generated content" (Texas A&M University-Kingsville).

Live detector and project site: https://www.deepfakedetect.fyi/
Open dataset: https://zenodo.org/records/20671008

## What is in this repo

- `add-on/` — the Firefox add-on (Manifest V2). Select text on any page, right-click, and choose "Check if this text is AI-generated". The verdict appears in a small panel on the page with an AI likelihood score and a plain-language explanation. A toolbar popup also lets you paste text directly. Text only for now; image and audio checks are on the roadmap described in the proposal.
- `api/check.js` — a small Vercel serverless function that proxies checks to a Hugging Face detection model so the API token stays server-side. Text sent to the API is processed for the check and is not stored or used to train models.
- `index.html` — a plain landing page for the API deployment.

## Model

`Hello-SimpleAI/chatgpt-detector-roberta`, a RoBERTa classifier trained on the HC3 dataset of human answers and ChatGPT answers, served from the team private Hugging Face Space (ZeroGPU Gradio), which this API calls with the owner token. The add-on reports an AI likelihood score and one of three verdicts: likely AI-generated, likely human-written, or uncertain.

## Guardrail

The add-on allows 5 free checks per day per browser (counted locally in extension storage, resetting at the start of each new day). After 5 checks it shows the limit message and points to the full detector at deepfakedetect.fyi.

## Run the API

1. Deploy this repo to Vercel (the `api/` folder becomes serverless functions automatically).
2. Set the environment variable `HF_TOKEN` to a Hugging Face access token (a free "Read" token from https://huggingface.co/settings/tokens works).
3. Health check: `GET /api/check` returns `{"ok": true}`. Run a check: `POST /api/check` with a JSON body `{"text": "..."}` (40 characters minimum).

## Load the add-on in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click "Load Temporary Add-on" and pick `add-on/manifest.json`.
3. Select text on any page, right-click, and choose "Check if this text is AI-generated".

The add-on points at the production API in `add-on/background.js` (`API_URL`). Change that constant to point at your own deployment.

## Publish to Firefox Add-ons (AMO)

1. Zip the contents of `add-on/` (with `manifest.json` at the zip root).
2. Submit at https://addons.mozilla.org/developers/ with the listing text: name "AI Text Check: Proving What Is Real", summary from `manifest.json`, and a privacy note stating that selected text is sent to the project's checker API for analysis and is not stored.

## Team

Lead PI: Dr. Shaif Chowdhury, Texas A&M University-Kingsville. Co-PIs: Dr. Nitesh Saxena (Texas A&M University), Dr. Tarek Mahmud, Dr. Avdesh Mishra, Dr. Dunren Che (Texas A&M University-Kingsville).
