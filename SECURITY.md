# Security Policy

`pdf-redact` is a redaction tool: its job is to make sure removed content is
**actually gone**. A bug that leaves redacted content recoverable is a security
vulnerability, not a normal bug — please treat it as one and report it privately.

## Supported versions

Security fixes are released for the latest published minor version on npm
(`@liiift-studio/pdf-redact`). Older versions are not patched — upgrade to the
latest before reporting.

| Version | Supported |
|---------|-----------|
| latest `0.x` | ✅ |
| older | ❌ (upgrade first) |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

- Preferred: use GitHub's private vulnerability reporting —
  **[Report a vulnerability](https://github.com/Liiift-Studio/pdf-redact/security/advisories/new)**
  (Security tab → "Report a vulnerability").
- Or email **hello@liiift.studio** with `[pdf-redact security]` in the subject.

Please include: the affected version, a minimal reproduction (ideally a small
non-sensitive PDF — do **not** send real personal data), and what you observed vs.
expected.

We aim to acknowledge within **3 business days** and to ship a fix or mitigation for
confirmed, high-severity issues as a priority patch release, crediting you unless you
prefer to stay anonymous.

## In scope (examples of what we consider a vulnerability)

- **Recoverable content after `redact()`/`searchAndRedact()`** — text, image, or
  vector content that survives under a redaction bar in the output.
- **`verify()` returning a false clean** — reporting `clean: true` (with no warnings)
  for a document that still has recoverable content under a bar.
- **Metadata / structure leaks** — redacted values surviving in DocInfo, XMP, form
  fields, bookmarks, attachments, or prior incremental-save revisions after redaction.
- **Denial of service** via a crafted PDF (unbounded memory/CPU, infinite loops).
- Any way to recover the pre-redaction bytes from a redacted output.

## Known limitations (documented, not vulnerabilities)

These are described in the [README's "Limitations & security model"](README.md#limitations--security-model)
and are expected behavior, not bugs:

- Content-stream scrubbing and `verify()` are **best-effort** and can fail *open* on
  unparseable/exotic PDFs — always run `verify()` and fail closed.
- Text rendered inside a **raster image (a scan)** is covered but not removed by the
  text-layer redaction; `redact()`/`verify()` surface a `scanned-page` warning, and
  true redaction of scans requires the OCR-flatten path.

If you are unsure whether something is in scope, report it privately and we will
triage it.
