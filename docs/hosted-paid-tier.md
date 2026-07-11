# Hosted / paid tier — design & decisions

Status: **plan only.** This tier cannot be implemented purely in code — it depends
on business/legal decisions (a Stripe account, a signed BAA with Anthropic, ToS/DPA
legal review, pricing). This doc captures the model and the exact decisions required
so it can be executed once those are made.

Pricing model informed by [Stirling PDF](https://stirling.com/pricing) — the closest
analog (open-source PDF tool → commercial): **meter usage, give away seats.** Seats
and SSO are table-stakes; the meter is documents processed.

## Why

Two interview findings drive this:

1. **BYOK is a UX cliff** for non-technical buyers (solo attorneys, small-business
   owners): "if I have to know what npm/an API key is to redact a client's SSN,
   you've already lost me." They need name/org/address detection **without a key**.
2. **BYOK is a privilege/PHI hazard.** A *personal* Anthropic key runs under consumer
   terms with **no BAA/DPA**, so routing client documents through it can waive
   privilege or be a reportable HIPAA event. A free MIT project has no legal entity to
   sign a BAA — so "open source ≠ safe" for regulated buyers.

## Tiers (per-document metering, no seats)

| Tier | Price | What it is |
|------|-------|-----------|
| **Free** | **$0 forever** | The whole current site: redact, batch, in-browser OCR, verify, exemption logs. Unlimited seats. BYOK for AI detection. MIT npm/CLI for self-host. |
| **Metered** | **~$0.0X / document processed** | Hosted AI detection (no key needed), server batch API + webhooks, org-wide audit logs, **usage-based spend caps**. Free starter credits (e.g. 500 docs), no credit card to start. |
| **Enterprise** | **Custom** | **Self-hostable / air-gapped** deployment (the regulated-buyer unlock), a signed **BAA + zero-data-retention**, advanced compliance controls, SLAs, volume discounts. |

Design principles borrowed from Stirling and validated by our interviews:

- **Meter documents, not seats.** Per-document pricing dodges the "I'm not buying
  seats" objection legal-ops raised. Unlimited seats + SSO even on paid.
- **Free credits, no card, spend caps.** Low-friction start; caps sold as a *feature*
  ("no surprise bills") to risk-averse buyers.
- **Free is the funnel, not a trial.** Monetize automation, scale, and compliance —
  never the core redaction, which stays free and open-source.
- **Self-host / air-gapped is a headline, not a footnote.** Our interviews said
  regulated buyers *legally cannot* touch a tool without a self-hostable / never-
  uploaded guarantee. The in-browser OCR + MIT npm already deliver most of this; the
  Enterprise tier packages it with a BAA and support. Arguably worth prioritizing
  above the hosted AI tier.

## Architecture

```
Browser ──▶ /api/detect (authed, metered)
                │  (no user-supplied key)
                ▼
        Server-side AI proxy
                │  Anthropic account under org BAA + ZDR
                ▼
        Anthropic Messages API (claude-haiku-4-5)
```

- **Auth:** Clerk (cross-repo decision — see [[project-strategic-issues]]) or Sign in
  with Vercel. Gate the metered AI tier + org features behind a session.
- **Billing / metering:** Stripe **usage-based billing** (meter = documents
  processed), Customer Portal for self-serve, spend caps enforced at the edge keyed on
  the Clerk org id. Free starter credits.
- **AI proxy:** server calls Anthropic under the *org's* account (server-held key),
  requiring **zero-data-retention** + a **BAA addendum** so document text is covered.
  Free users keep BYOK.
- **Data handling:** in-memory only, no persistence, no content logging — same as
  today. Documented precisely for the BAA and a public DPA.

## What's already in place

- `/api/detect` already does server-side Anthropic calls — today with the user's key.
  Swapping to a server-held key behind auth + a meter is a small change.
- In-memory, no-storage handling is already the pattern across all routes.
- `PrivacyNote` already states where files go; the site now has a "Where your files
  go" self-host section and a "Built for" verticals section (the Enterprise story).
- MIT npm/CLI already delivers the self-host substrate.

## Decisions required (NOT codeable — need the business owner)

1. **Anthropic BAA + ZDR** (commercial agreement w/ BAA addendum + zero-data-retention).
   Without it, do NOT market a HIPAA/privilege-safe tier.
2. **Stripe account** (legal entity, tax) + confirm the per-document price and free-
   credit amount.
3. **Legal:** ToS, a public DPA, and the BAA template — all need review.
4. **Auth provider** (Clerk vs Sign in with Vercel).

## Phasing

- **Phase 1 (codeable now, once accounts exist):** Clerk auth + Stripe usage-based
  metering + server-held Anthropic key for the AI detect tier (marketed as "no key
  needed", NOT yet BAA-safe). Free credits + spend caps.
- **Phase 2 (after BAA):** enable the BAA/ZDR path + the self-host/air-gapped
  Enterprise packaging; publish the DPA + BAA; market to legal/healthcare.

## Explicitly out of scope for the agent

Creating the Stripe account, signing the BAA, and accepting legal agreements must be
done by the account owner. The agent can scaffold Phase 1 code once auth + billing
accounts exist and the owner authorizes it.
