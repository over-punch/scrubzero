# Contributing to scrubzero

Thanks for helping make PDF redaction actually safe. This is a small, focused
library — a true content-stream redactor for Node.js and Lambda with no native
binaries — and contributions that keep it that way are very welcome.

> Found a **security** issue (redacted content still recoverable, `verify()` false
> clean, a leak)? Do **not** open a public issue — follow [SECURITY.md](SECURITY.md).

## Getting set up

Requires Node.js >= 18.

```bash
git clone https://github.com/Liiift-Studio/scrubzero
cd scrubzero
npm install
npm run build       # tsup → dual ESM + CJS in dist/
npm test            # vitest run
npm run typecheck   # tsc --noEmit
```

The public API lives in `src/` (`redact.ts`, `search-and-redact.ts`,
`entity-patterns.ts`, `verify.ts`, `content-stream.ts`, `cli.ts`). `dist/` is
generated — never edit or commit it.

## Before you open a PR

1. **Add a test.** Anything that changes redaction, verification, or content-stream
   handling needs a `vitest` test — especially a regression test proving removed
   content is unrecoverable. See the existing `*.test.ts` files for the fixture style
   (build a small PDF with `pdf-lib`, run the function, assert on the output).
2. `npm test`, `npm run typecheck`, and `npm run build` all pass.
3. Keep the change **focused** — this library's value is that it's small and
   auditable.

## Conventions

- **Tabs** for indentation (match the surrounding code).
- Comment every exported function, type, and non-obvious block — this is a
  security-sensitive library, so clarity matters more than brevity.
- Don't add runtime dependencies without a strong reason; "no native binaries, runs
  in Lambda" is a core promise.
- Follow [Conventional-ish commit subjects](https://www.conventionalcommits.org/) —
  a clear imperative summary line is enough.

## Releasing (maintainers)

`npm version <patch|minor>` → `npm run build` (via `prepublishOnly`, which also
typechecks) → `npm publish`. Bump the `pkg.version` string in `src/cli.ts` to match.

## Reporting bugs & ideas

Open a [bug report](https://github.com/Liiift-Studio/scrubzero/issues/new/choose) or
a feature request via the issue templates. For open-ended questions, start a
Discussion. By contributing, you agree your work is licensed under the project's
[MIT License](LICENSE).
