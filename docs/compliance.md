# Compliance & data handling (Phase 2 status)

This documents scrubzero.org's data-handling posture and what remains before the
paid tier can be marketed to HIPAA/legal buyers. **Not legal advice** — the DPA/BAA
items below need review by counsel.

## What the service does with your data (current, all tiers)

- **In-memory only.** Uploaded PDFs are processed in the request and never written
  to disk or logged; they're discarded when the response is sent. This holds for
  redact, detect, verify, audit, batch, and OCR (OCR runs entirely in the browser —
  the file never leaves the device).
- **No content in logs.** Routes log errors, not document contents.
- **No third parties on the free/local paths.** Redact/verify/audit/OCR touch no
  external service.

## AI detection (the only path that leaves our infra)

- **BYOK (free):** the user's own Anthropic key calls Anthropic directly. Their key,
  their account terms — we don't proxy or store it.
- **Hosted (credits):** routed through the **Vercel AI Gateway** (AI SDK). Applied on
  every hosted call:
  - `disallowPromptTraining: true` — routes only to providers that don't train on
    submitted prompts (**always on**).
  - `zeroDataRetention` — opt-in via `AI_GATEWAY_ZDR=true`. Routes only to
    zero-data-retention providers. **Requires a Vercel Pro/Enterprise plan**; the
    request fails if no ZDR-eligible provider is available, so it's off by default.

## Phase 2 — what's done vs. what's required

**Done (technical, in code):**
- In-memory processing, no content storage/logging.
- `disallowPromptTraining` on all hosted AI calls.
- ZDR-ready: flip `AI_GATEWAY_ZDR=true` once the plan supports it.

**Required before marketing a HIPAA / legal-privilege tier (owner + legal — NOT
codeable by the agent):**
1. **Signed Anthropic BAA + zero-data-retention** (Anthropic commercial/enterprise
   agreement). Until signed, do NOT represent the hosted AI tier as HIPAA-safe.
2. **Vercel Pro/Enterprise** plan for request-level ZDR enforcement, then set
   `AI_GATEWAY_ZDR=true`.
3. **Public DPA** and a **BAA template**, reviewed by counsel.
4. A subprocessor list (Vercel, Anthropic) published alongside the DPA.

## Honest current stance

The service is privacy-forward (in-memory, no storage, no prompt training) and
ZDR-ready, but it is **not yet BAA-covered**. Marketing copy must not claim HIPAA /
privilege safety for the hosted AI tier until items 1–4 above are complete. BYOK and
the local/in-browser tools carry no such dependency.
