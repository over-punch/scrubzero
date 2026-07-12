import type { NextConfig } from "next"

const nextConfig: NextConfig = {
	// Keep these out of the server bundle so their runtime dynamic imports (pdfjs
	// worker/legacy build, opentype, etc.) resolve from node_modules. NOTE: the
	// `scrubzero` package internally `await import('pdfjs-dist/…')` and
	// `import('pdf-lib')`, which the bundler mangles unless it's externalized.
	serverExternalPackages: [
		"pdfjs-dist",
		"pdf-lib",
		"opentype.js",
		"scrubzero",
	],
	// Anchor file tracing to this app dir (the parent turbopack.root would otherwise
	// confuse where the include globs resolve from).
	outputFileTracingRoot: __dirname,
	// pdfjs-dist's Node "fake worker" dynamically imports pdf.worker.mjs, a path the
	// tracer can't see — so force-include the legacy build in each API function that
	// touches pdfjs (redact, detect, and audit — all via the scrubzero package).
	// Without this the functions 500 with "Setting up fake worker failed: …".
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
