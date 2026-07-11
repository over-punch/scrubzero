# Hosted, BAA-eligible paid tier — design & decisions

Status: **plan only.** This tier cannot be implemented purely in code — it depends
on business/legal decisions (a Stripe account, a signed BAA with Anthropic, ToS/DPA
legal review, pricing). This doc captures the architecture and the exact decisions
required so it can be executed once those are made.

## Why

Two interview findings drive this:

1. **BYOK is a UX cliff** for non-technical buyers (solo attorneys, small-business
   owners): "if I have to know what npm/an API key is to redact a client's SSN,
   you've already lost me." They need name/org/address detection **without a key**.
2. **BYOK is a privilege/PHI hazard.** A *personal* Anthropic key runs under
   consumer terms with **no BAA/DPA**, so routing client documents through it can
   waive privilege or be a reportable HIPAA event. A free MIT project has no legal
   entity to sign a BAA — so "open source ≠ safe" for regulated buyers.

The paid tier solves both: hosted detection (no key) on infrastructure covered by a
signed BAA + zero-data-retention.

## Architecture

```
Browser ──▶ /api/detect (authed)
                │  (no user-supplied key)
                ▼
        Server-side AI proxy
                │  Anthropic account under org BAA + ZDR
                ▼
        Anthropic Messages API (claude-haiku-4-5)
```

- **Auth:** Clerk (already the cross-repo decision — see [[project-strategic-issues]])
  or Sign in with Vercel. Gate `/api/detect` AI tier + paid features behind a session.
- **Billing:** Stripe. Metered (per page OCR'd / per AI scan) or a flat monthly plan
  with quotas. Stripe Customer Portal for self-serve management.
- **AI proxy:** server calls Anthropic under the *org's* account (not the user's),
  using an API key held server-side. Requires Anthropic **zero-data-retention** and a
  **BAA addendum** so document text is covered. This replaces BYOK for paid users;
  free users keep BYOK.
- **Data handling:** in-memory only, no persistence, no logging of document content —
  same as today's routes. Document this precisely for the BAA and a public DPA.
- **Quotas / rate limiting:** per-plan limits enforced at the edge (Vercel) keyed on
  the Clerk user/org id.

## What's already in place

- `/api/detect` already does server-side Anthropic calls — today with the user's key.
  Swapping to a server-held key behind auth is a small change.
- In-memory, no-storage request handling is already the pattern across all routes.
- The privacy statement (`PrivacyNote`) already tells users where the file goes.

## Decisions required (NOT codeable — need the business owner)

1. **Anthropic BAA + ZDR.** Requires a commercial agreement with Anthropic that
   includes a BAA addendum and zero-data-retention. Without this, do NOT market a
   HIPAA/privilege-safe tier.
2. **Stripe account** (legal entity, tax setup) + chosen pricing model.
3. **Legal:** Terms of Service, a public DPA, and the BAA template — all need review.
4. **Auth provider confirmation** (Clerk vs Sign in with Vercel).

## Suggested phasing

- **Phase 1 (codeable now):** Clerk auth + Stripe checkout + server-held Anthropic key
  behind the paywall for the AI detect tier (marketed as "no key needed", NOT yet
  BAA-safe). Quotas per plan.
- **Phase 2 (after BAA):** enable the BAA/ZDR path and market the compliance tier to
  legal/healthcare buyers, with the DPA and BAA available.

## Explicitly out of scope for the agent

Creating the Stripe account, signing the BAA, and accepting legal agreements must be
done by the account owner. The agent can scaffold Phase 1 code once auth + billing
accounts exist and the owner authorizes it.
