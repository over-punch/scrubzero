import type { NextConfig } from "next"

const nextConfig: NextConfig = {
	// Keep these out of the server bundle so their runtime dynamic imports (pdfjs
	// worker/legacy build, opentype, etc.) resolve from node_modules. NOTE: these
	// must be the real installed package names — the scoped @liiift-studio/*
	// packages internally `await import('pdfjs-dist/…')` and `import('pdf-lib')`,
	// which the bundler mangles unless the whole package is externalized.
	serverExternalPackages: [
		"pdfjs-dist",
		"pdf-lib",
		"opentype.js",
		"@liiift-studio/pdf-redact",
		"@liiift-studio/unseal",
	],
	// Anchor file tracing to this app dir (the parent turbopack.root would otherwise
	// confuse where the include globs resolve from).
	outputFileTracingRoot: __dirname,
	// pdfjs-dist's Node "fake worker" dynamically imports pdf.worker.mjs, a path the
	// tracer can't see — so force-include the legacy build in each API function that
	// touches pdfjs (redact/detect via pdf-redact, audit via unseal). Without this
	// the functions 500 with "Setting up fake worker failed: Cannot find module …".
	outputFileTracingIncludes: {
		"/api/redact": ["./node_modules/pdfjs-dist/legacy/build/*.mjs"],
		"/api/detect": ["./node_modules/pdfjs-dist/legacy/build/*.mjs"],
		"/api/audit": ["./node_modules/pdfjs-dist/legacy/build/*.mjs"],
	},
	turbopack: {
		// Must match outputFileTracingRoot; anchor to this self-contained app dir.
		root: __dirname,
	},
	experimental: {
		serverActions: {
			bodySizeLimit: "8mb",
		},
	},
}

export default nextConfig
