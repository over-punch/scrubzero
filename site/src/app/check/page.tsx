// scrubzero — CHECK mode (dark). Audit a PDF you received: is it actually redacted?
// Backed by the @liiift-studio/unseal package; toggle to / for Redact mode.
import type { Metadata } from "next"
import AuditDemo from "@/components/AuditDemo"
import CodeBlock from "@/components/CodeBlock"
import CopyInstall from "@/components/CopyInstall"
import { ThemeMode } from "@/components/ThemeMode"
import { ModeToggle } from "@/components/ModeToggle"
import { PrivacyNote } from "@/components/PrivacyNote"
import { version } from "../../../package.json"

export const maxDuration = 60

export const metadata: Metadata = {
	title: "scrubzero — Check: is your PDF actually redacted?",
	description: "Audit any PDF for fake redaction — text hidden under filled boxes, recoverable prior revisions, metadata leaks, and unapplied annotations. The check side of scrubzero.",
	openGraph: {
		title: "scrubzero — Check: is your PDF actually redacted?",
		description: "Drop a PDF and see if its redactions actually hold. Text under the bar, prior revisions, metadata leaks — detected in one pass.",
		url: "https://scrubzero.org/check",
		siteName: "scrubzero",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "scrubzero — Check: is your PDF actually redacted?",
		description: "Drop a PDF and see if its redactions actually hold.",
	},
}

function SectionLabel({ n, children }: { n: string; children: React.ReactNode }) {
	return (
		<div className="flex items-center gap-3 mb-10">
			<span className="mono-label shrink-0" style={{ color: "var(--ink-faint)" }}>{n}</span>
			<span className="mono-label shrink-0" style={{ color: "var(--foreground)" }}>{children}</span>
			<div className="flex-1 h-px" style={{ background: "var(--rule)" }} />
		</div>
	)
}

function Severity({ level }: { level: "CRITICAL" | "HIGH" | "MEDIUM" }) {
	const style =
		level === "CRITICAL" ? { background: "var(--stamp)", color: "#fff" } :
		level === "HIGH" ? { border: "1px solid var(--stamp)", color: "var(--stamp)" } :
		{ border: "1px solid var(--border-strong)", color: "var(--ink-dim)" }
	return (
		<span className="text-[10px] px-2 py-0.5 rounded-sm shrink-0" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.1em", ...style }}>
			{level}
		</span>
	)
}

export default function Check() {
	return (
		<>
			{/* Prevent a light flash before hydration on direct loads of /check. */}
			<script dangerouslySetInnerHTML={{ __html: "document.documentElement.dataset.mode='check'" }} />
			<main className="max-w-2xl mx-auto w-full px-6 py-16 flex flex-col">
				<ThemeMode mode="check" />

				{/* ── Masthead ─────────────────────────────────────────────── */}
				<header className="mb-14">
					<div className="flex items-center justify-between gap-4">
						<span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "1.35rem", letterSpacing: "-0.01em" }}>
							scrubzero
						</span>
						<ModeToggle />
					</div>
					<div className="flex items-end justify-between gap-4 mt-3">
						<span className="mono-label">Fake-redaction forensics</span>
						<span className="verdict verdict--fail">
							<span className="verdict__glyph">✗</span> Recoverable
						</span>
					</div>
					<div className="h-px mt-5" style={{ background: "var(--rule-strong)" }} />
					<div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 mono-label">
						<span>v{version}</span>
						<span>MIT</span>
						<span>Node.js / Lambda</span>
						<span>4 checks + 2 tiers</span>
					</div>
					<div className="mt-2 mono-label" style={{ color: "var(--ink-faint)", letterSpacing: "0.1em" }}>
						SHA-256 · input a4f2‥e19 → output a4f2‥e19 · identical — the bar changed nothing underneath
					</div>
					<PrivacyNote />
				</header>

				{/* ── Hero ─────────────────────────────────────────────────── */}
				<section className="mb-20">
					<h1
						className="leading-[1.0] mb-8"
						style={{ fontFamily: "var(--font-display)", fontSize: "clamp(3rem, 10vw, 5.5rem)", letterSpacing: "-0.01em" }}
					>
						Is it actually<br />
						<span style={{ fontStyle: "italic" }}>redacted?</span>
					</h1>

					{/* Bars retract to expose the text they were meant to hide */}
					<div className="mb-8 flex flex-col gap-2" aria-hidden="true">
						{[
							{ w: "100%", text: "jdoe@agency.gov", code: "(b)(6)", d: "0.2s" },
							{ w: "82%", text: "(202) 555-0147", code: "(b)(7)(C)", d: "0.33s" },
							{ w: "94%", text: "Case 1:24-cr-00318", code: "(b)(6)", d: "0.46s" },
						].map(({ w, text, code, d }, i) => (
							<div key={i} className="redln redln--reveal" style={{ width: w }}>
								<span className="redln__text">{text}</span>
								<span className="redln__bar" style={{ animationDelay: d }}><span>{code}</span></span>
							</div>
						))}
					</div>

					<p className="text-base leading-relaxed mb-8" style={{ color: "var(--ink-dim)" }}>
						Most redactions are just a black box drawn over live text that anyone can copy straight out.
						Check finds text hidden under filled boxes, recoverable prior revisions, metadata leaks, and unapplied
						annotations — and can lift the fake bars to <em style={{ fontStyle: "normal", color: "var(--foreground)" }}>reveal exactly what they failed to hide.</em> Powered by the unseal package, for Node.js and Lambda.
					</p>

					<div className="flex flex-wrap items-center gap-4">
						<CopyInstall pkg="@liiift-studio/unseal" />
						<a
							href="https://npmjs.com/package/@liiift-studio/unseal"
							className="text-xs font-medium px-4 py-2 rounded-full transition-opacity hover:opacity-80"
							style={{ background: "var(--btn-bg)", color: "var(--btn-fg)", fontFamily: "var(--font-mono)" }}
						>
							npm
						</a>
						<a
							href="https://github.com/Liiift-Studio/unseal"
							className="text-xs px-4 py-2 rounded-full border transition-opacity opacity-70 hover:opacity-100"
							style={{ borderColor: "var(--border)", color: "var(--ink-dim)", fontFamily: "var(--font-mono)" }}
						>
							GitHub
						</a>
					</div>
				</section>

				<div className="h-px mb-20" style={{ background: "var(--rule)" }} />

				{/* ── Live audit ───────────────────────────────────────────── */}
				<section className="mb-20">
					<SectionLabel n="01">Live audit</SectionLabel>
					<p className="text-sm mb-6" style={{ color: "var(--ink-dim)" }}>
						Upload any PDF. No data is stored. No AI is used for Tier 1.
					</p>
					<AuditDemo />
				</section>

				<div className="h-px mb-20" style={{ background: "var(--rule)" }} />

				{/* ── Four checks ──────────────────────────────────────────── */}
				<section className="mb-20">
					<SectionLabel n="02">Four checks</SectionLabel>
					<div className="flex flex-col divide-y" style={{ borderColor: "var(--rule)" }}>
						{[
							{ n: "01", label: "Text under box", severity: "CRITICAL" as const, body: "The most common mistake: a black rectangle drawn on top of text, but the text operators remain in the content stream. Check scans every filled rectangle against underlying text items and surfaces the hidden content verbatim." },
							{ n: "02", label: "Incremental save", severity: "HIGH" as const, body: "When a PDF is saved incrementally, prior content is appended rather than replaced. Earlier versions of the document sit in the same byte stream. Check detects the %%EOF signature pattern and flags the recoverable revision." },
							{ n: "03", label: "Metadata leak", severity: "MEDIUM" as const, body: "Title, Author, Subject, Keywords, and XMP streams survive many redaction workflows. Redacted names or document titles often remain in DocInfo or embedded XMP even after the visible content is blacked out." },
							{ n: "04", label: "Pending annotations", severity: "CRITICAL" as const, body: "PDF/A and most redaction tools create Redact-subtype annotations to mark regions for removal. They are only effective after the tool applies them. Many workflows skip that step — the annotations are present, the text beneath is untouched." },
						].map(({ n, label, severity, body }) => (
							<div key={n} className="py-6 flex flex-col gap-2">
								<div className="flex items-baseline gap-4">
									<span className="mono-label" style={{ color: "var(--ink-faint)" }}>{n}</span>
									<span className="text-sm font-medium flex-1">{label}</span>
									<Severity level={severity} />
								</div>
								<p className="text-sm leading-relaxed pl-9" style={{ color: "var(--ink-dim)" }}>{body}</p>
							</div>
						))}
					</div>
				</section>

				<div className="h-px mb-20" style={{ background: "var(--rule)" }} />

				{/* ── Usage ────────────────────────────────────────────────── */}
				<section className="mb-20">
					<SectionLabel n="03">Usage</SectionLabel>
					<div className="flex flex-col gap-10">
						<div className="flex flex-col gap-3">
							<p className="mono-label">Basic audit</p>
							<CodeBlock code={`import { audit } from '@liiift-studio/unseal'
import { readFile } from 'node:fs/promises'

const pdf = await readFile('document.pdf')
const report = await audit(pdf.buffer)

if (!report.clean) {
  for (const finding of report.findings) {
    console.log(finding.severity, finding.check, finding.recoveredText)
  }
}`} />
						</div>
						<div className="flex flex-col gap-3">
							<p className="mono-label">Reveal — lift the fake bars so the hidden text is readable</p>
							<CodeBlock code={`import { unseal } from '@liiift-studio/unseal'

const result = await unseal(pdf.buffer)
// result.pdf         — the document with the fake redaction stripped,
//                      so the text it was hiding is now readable
// result.findings    — what was recovered, and how it was hidden
// result.auditReport — full audit of the original`} />
						</div>
						<div className="flex flex-col gap-3">
							<p className="mono-label">CLI</p>
							<CodeBlock code={`npx @liiift-studio/unseal audit document.pdf
npx @liiift-studio/unseal audit document.pdf --preset forensic --json
npx @liiift-studio/unseal strip document.pdf --output unsealed.pdf --report findings.json`} />
						</div>
					</div>
				</section>

				{/* ── Footer ───────────────────────────────────────────────── */}
				<footer className="pt-8 flex flex-col gap-6 text-xs" style={{ borderTop: "1px solid var(--rule-strong)" }}>
					<div className="flex flex-col gap-2">
						<span className="mono-label">The other side of the tool</span>
						<a href="/" className="group inline-flex items-baseline gap-1 text-sm">
							<span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>Redact</span>
							<span style={{ color: "var(--ink-dim)" }}>— scrub a PDF so nothing is recoverable</span>
							<span className="inline-block transition-transform group-hover:translate-x-1" style={{ color: "var(--ink-dim)" }}>→</span>
						</a>
					</div>
					<div className="flex flex-wrap items-center gap-x-6 gap-y-1" style={{ color: "var(--ink-dim)", fontFamily: "var(--font-mono)" }}>
						<a href="https://liiift.studio" target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity">liiift.studio</a>
						<a href="https://github.com/Liiift-Studio/unseal" target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity">GitHub</a>
						<a href="https://npmjs.com/package/@liiift-studio/unseal" target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity">npm</a>
						<span>v{version}</span>
						<span className="ml-auto px-1.5 py-0.5" style={{ color: "var(--ink-faint)", border: "1px solid var(--border)", borderRadius: "2px", letterSpacing: "0.08em" }}>
							UNSEAL-000447
						</span>
					</div>
				</footer>

			</main>
		</>
	)
}
