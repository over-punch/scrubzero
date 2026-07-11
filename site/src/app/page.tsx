// scrubzero — REDACT mode (light). Toggle to /check for the audit mirror.
import RedactDemo from "@/components/RedactDemo"
import OcrRedactDemo from "@/components/OcrRedactDemo"
import BatchRedactDemo from "@/components/BatchRedactDemo"
import CodeBlock from "@/components/CodeBlock"
import CopyInstall from "@/components/CopyInstall"
import { ThemeMode } from "@/components/ThemeMode"
import { ModeToggle } from "@/components/ModeToggle"
import { PrivacyNote } from "@/components/PrivacyNote"
import { version } from "../../package.json"

export const maxDuration = 60

// Restrained numbered section header: 01 · Sandbox ──────────
function SectionLabel({ n, children }: { n: string; children: React.ReactNode }) {
	return (
		<div className="flex items-center gap-3 mb-10">
			<span className="mono-label shrink-0" style={{ color: "var(--ink-faint)" }}>{n}</span>
			<span className="mono-label shrink-0" style={{ color: "var(--foreground)" }}>{children}</span>
			<div className="flex-1 h-px" style={{ background: "var(--rule)" }} />
		</div>
	)
}

export default function Home() {
	return (
		<main className="max-w-2xl mx-auto w-full px-6 py-16 flex flex-col">
			<ThemeMode mode="redact" />

			{/* ── Masthead ─────────────────────────────────────────────── */}
			<header className="mb-14">
				<div className="flex items-center justify-between gap-4">
					<span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "1.35rem", letterSpacing: "-0.01em" }}>
						scrubzero
					</span>
					<ModeToggle />
				</div>
				<div className="flex items-end justify-between gap-4 mt-3">
					<span className="mono-label">Content-stream PDF redaction</span>
					<span className="verdict verdict--pass">
						<span className="verdict__glyph">✓</span> No recoverable text
					</span>
				</div>
				<div className="h-px mt-5" style={{ background: "var(--rule-strong)" }} />
				<div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 mono-label">
					<span>v{version}</span>
					<span>MIT</span>
					<span>Node.js / Lambda</span>
					<span>Zero-dependency core</span>
				</div>
				<PrivacyNote />
			</header>

			{/* ── Hero ─────────────────────────────────────────────────── */}
			<section className="mb-20">
				<h1
					className="leading-[1.0] mb-8"
					style={{ fontFamily: "var(--font-display)", fontSize: "clamp(3rem, 10vw, 5.5rem)", letterSpacing: "-0.01em" }}
				>
					True PDF<br />
					<span style={{ fontStyle: "italic" }}>redaction.</span>
				</h1>

				<div className="mb-8 flex flex-col gap-2" aria-hidden="true">
					{[
						{ w: "100%", text: "jdoe@agency.gov", code: "(b)(6)", d: "0.7s" },
						{ w: "82%", text: "(202) 555-0147", code: "(b)(7)(C)", d: "0.95s" },
						{ w: "94%", text: "Case 1:24-cr-00318", code: "(b)(6)", d: "1.2s" },
					].map(({ w, text, code, d }, i) => (
						<div key={i} className="redln redln--cover" style={{ width: w }}>
							<span className="redln__text">{text}</span>
							<span className="redln__bar" style={{ animationDelay: d }}><span>{code}</span></span>
						</div>
					))}
				</div>

				<p className="text-base leading-relaxed mb-8" style={{ color: "var(--ink-dim)" }}>
					scrubzero removes text operators from the page content stream <em style={{ fontStyle: "normal", color: "var(--foreground)" }}>before</em> drawing the visual bar.
					No hidden layers. No recoverable text. Built for server-side use in Node.js and AWS Lambda.
				</p>

				<div className="flex flex-wrap items-center gap-4">
					<CopyInstall pkg="@liiift-studio/pdf-redact" />
					<a
						href="https://npmjs.com/package/@liiift-studio/pdf-redact"
						className="text-xs font-medium px-4 py-2 rounded-full transition-opacity hover:opacity-80"
						style={{ background: "var(--btn-bg)", color: "var(--btn-fg)", fontFamily: "var(--font-mono)" }}
					>
						npm
					</a>
					<a
						href="https://github.com/Liiift-Studio/pdf-redact"
						className="text-xs px-4 py-2 rounded-full border transition-opacity opacity-70 hover:opacity-100"
						style={{ borderColor: "var(--border)", fontFamily: "var(--font-mono)" }}
					>
						GitHub
					</a>
				</div>
			</section>

			<div className="h-px mb-20" style={{ background: "var(--rule)" }} />

			{/* ── Sandbox ──────────────────────────────────────────────── */}
			<section className="mb-20">
				<SectionLabel n="01">Sandbox</SectionLabel>
				<p className="text-sm mb-6" style={{ color: "var(--ink-dim)" }}>
					Upload a PDF, enter a search pattern (plain text or <code className="font-mono text-xs px-1 rounded" style={{ background: "var(--surface-2)" }}>/regex/flags</code>), download the redacted result.
				</p>
				<RedactDemo />
			</section>

			<div className="h-px mb-20" style={{ background: "var(--rule)" }} />

			{/* ── Scanned PDFs (in-browser OCR redaction) ──────────────── */}
			<section className="mb-20">
				<SectionLabel n="02">Scanned PDFs</SectionLabel>
				<p className="text-sm mb-6" style={{ color: "var(--ink-dim)" }}>
					A scan is an image — a bar drawn over it removes nothing. This tool OCRs the pages, burns opaque boxes
					into the pixels, and rebuilds the PDF from the flattened images, so the original content is destroyed.
					It runs <em style={{ fontStyle: "normal", color: "var(--foreground)" }}>entirely in your browser</em> — the file never leaves your device.
				</p>
				<OcrRedactDemo />
			</section>

			<div className="h-px mb-20" style={{ background: "var(--rule)" }} />

			{/* ── Batch redaction ──────────────────────────────────────── */}
			<section className="mb-20">
				<SectionLabel n="03">Batch</SectionLabel>
				<p className="text-sm mb-6" style={{ color: "var(--ink-dim)" }}>
					Apply one pattern across many PDFs at once. Each file is redacted and re-verified independently,
					then everything is zipped together with per-file audit logs and a batch summary.
				</p>
				<BatchRedactDemo />
			</section>

			<div className="h-px mb-20" style={{ background: "var(--rule)" }} />

			{/* ── How it works ─────────────────────────────────────────── */}
			<section className="mb-20">
				<SectionLabel n="04">How it works</SectionLabel>
				<div className="flex flex-col divide-y" style={{ borderColor: "var(--rule)" }}>
					{[
						{ n: "01", label: "Content stream scrubbing", body: "pdfjs-dist extracts text items with positions. For each match, scrubzero locates the BT/ET block in the raw content stream bytes, finds the text-drawing operators, and blanks their string arguments. The glyph data is gone before the bar is drawn." },
						{ n: "02", label: "Visual bar overlay", body: "After scrubbing, pdf-lib draws a filled rectangle over the region using the specified color (default black). The bar is a genuine visual layer on top of now-empty space — there is no text underneath to recover." },
						{ n: "03", label: "Metadata sanitization", body: "DocInfo fields (Title, Author, Subject, Keywords, Producer, Creator) are wiped and timestamps reset. The XMP metadata stream is removed from the document catalog. Enabled by default, disable with sanitizeMetadata: false." },
						{ n: "04", label: "Audit manifest", body: "When generateManifest: true, each redaction entry is recorded with page number, bounding box, timestamp, optional redactor ID, basis code, and SHA-256 hashes of both the input and output PDF for chain-of-custody compliance." },
						{ n: "05", label: "Scanned pages are flagged, then handled", body: "Redaction works on the text layer. A scanned or image-only page has no text to remove, so a bar there only covers the pixels — it does not delete them. scrubzero detects this and returns a warning instead of a false all-clear, then the Scanned PDFs tool above OCRs the page, burns the boxes into the pixels, and rebuilds the file from flattened images — all in your browser, so the scan never leaves your device." },
					].map(({ n, label, body }) => (
						<div key={n} className="py-6 flex flex-col gap-2">
							<div className="flex items-baseline gap-4">
								<span className="mono-label" style={{ color: "var(--ink-faint)" }}>{n}</span>
								<span className="text-sm font-medium">{label}</span>
							</div>
							<p className="text-sm leading-relaxed pl-9" style={{ color: "var(--ink-dim)" }}>{body}</p>
						</div>
					))}
				</div>
			</section>

			<div className="h-px mb-20" style={{ background: "var(--rule)" }} />

			{/* ── Usage ────────────────────────────────────────────────── */}
			<section className="mb-20">
				<SectionLabel n="05">Usage</SectionLabel>
				<div className="flex flex-col gap-10">
					<div className="flex flex-col gap-3">
						<p className="mono-label">Search and redact by text pattern</p>
						<CodeBlock code={`import { searchAndRedact } from '@liiift-studio/pdf-redact'
import { readFile, writeFile } from 'node:fs/promises'

const pdf = await readFile('document.pdf')
const result = await searchAndRedact(pdf.buffer, [
  { pattern: /John Smith/g, label: 'REDACTED' },
  { pattern: /\\d{3}-\\d{2}-\\d{4}/g, label: 'SSN' },
])

await writeFile('redacted.pdf', result.pdf)
console.log(\`\${result.redactedCount} regions redacted\`)`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="mono-label">Redact specific regions by coordinate</p>
						<CodeBlock code={`import { redact } from '@liiift-studio/pdf-redact'

const result = await redact(pdf.buffer, [
  { page: 1, x: 72, y: 140, width: 200, height: 18 },
  { page: 2, x: 72, y: 200, width: 150, height: 18 },
])`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="mono-label">Entity patterns — SSN, phone, email, credit card, and more</p>
						<CodeBlock code={`import { redactEntities } from '@liiift-studio/pdf-redact'

const result = await redactEntities(pdf.buffer, [
  'ssn', 'phone', 'email', 'credit-card',
])`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="mono-label">Audit manifest with FOIA exemption codes</p>
						<CodeBlock code={`const result = await redact(pdf.buffer, regions, {
  generateManifest: true,
  redactorId: 'agent-smith',
  basisCode: 'b6',           // FOIA Exemption 6
  addRedactionMarkers: true, // print exemption code in bar
})`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="mono-label">CLI</p>
						<CodeBlock code={`npx @liiift-studio/pdf-redact search document.pdf "John Smith" --output redacted.pdf
npx @liiift-studio/pdf-redact search document.pdf "/\\d{3}-\\d{2}-\\d{4}/g" --color #1a1a1a
npx @liiift-studio/pdf-redact entities document.pdf --types ssn,phone,email
npx @liiift-studio/pdf-redact verify redacted.pdf`} />
					</div>
				</div>

				{/* Options table */}
				<div className="mt-10 flex flex-col gap-3">
					<p className="mono-label">RedactOptions</p>
					<table className="w-full text-xs border-collapse" style={{ fontFamily: "var(--font-mono)" }}>
						<thead>
							<tr className="border-b" style={{ borderColor: "var(--rule)" }}>
								<th className="pb-2 pr-6 font-normal text-left mono-label">Option</th>
								<th className="pb-2 pr-6 font-normal text-left mono-label">Default</th>
								<th className="pb-2 font-normal text-left mono-label">Description</th>
							</tr>
						</thead>
						<tbody>
							{[
								["sanitizeMetadata", "true", "Wipe DocInfo fields and remove XMP metadata stream"],
								["flattenAnnotations", "true", "Flatten annotation layers before redacting"],
								["addRedactionMarkers", "false", "Render label or exemption code inside the bar"],
								["generateManifest", "false", "Attach a JSON audit manifest with SHA-256 hashes"],
								["redactorId", "undefined", "Operator ID recorded in the manifest"],
								["basisCode", "undefined", "FOIA basis code (e.g. 'b6') rendered in the bar when markers are on"],
							].map(([opt, def, desc]) => (
								<tr key={opt} className="border-b" style={{ borderColor: "var(--rule)" }}>
									<td className="py-2.5 pr-6">{opt}</td>
									<td className="py-2.5 pr-6" style={{ color: "var(--ink-dim)" }}>{def}</td>
									<td className="py-2.5" style={{ color: "var(--ink-dim)", fontFamily: "var(--font-sans)" }}>{desc}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			{/* ── Footer ───────────────────────────────────────────────── */}
			<footer className="pt-8 flex flex-col gap-6 text-xs" style={{ borderTop: "1px solid var(--rule-strong)" }}>
				<div className="flex flex-col gap-2">
					<span className="mono-label">The other side of the tool</span>
					<a href="/check" className="group inline-flex items-baseline gap-1 text-sm">
						<span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>Verify</span>
						<span style={{ color: "var(--ink-dim)" }}>— is a PDF you received actually redacted?</span>
						<span className="inline-block transition-transform group-hover:translate-x-1" style={{ color: "var(--ink-dim)" }}>→</span>
					</a>
				</div>
				<div className="flex flex-wrap items-center gap-x-6 gap-y-1" style={{ color: "var(--ink-dim)", fontFamily: "var(--font-mono)" }}>
					<a href="https://liiift.studio" target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity">liiift.studio</a>
					<a href="https://github.com/Liiift-Studio/pdf-redact" target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity">GitHub</a>
					<a href="https://npmjs.com/package/@liiift-studio/pdf-redact" target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity">npm</a>
					<span>v{version}</span>
					<span className="ml-auto px-1.5 py-0.5" style={{ color: "var(--ink-faint)", border: "1px solid var(--border)", borderRadius: "2px", letterSpacing: "0.08em" }}>
						SCRUBZERO-000447
					</span>
				</div>
			</footer>

		</main>
	)
}
