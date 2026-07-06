// scrubzero — DETECT mode (light). Find what should be redacted, then scrub it.
import type { Metadata } from "next"
import DetectDemo from "@/components/DetectDemo"
import { ThemeMode } from "@/components/ThemeMode"
import { ModeToggle } from "@/components/ModeToggle"
import { version } from "../../../package.json"

export const maxDuration = 60

export const metadata: Metadata = {
	title: "scrubzero — Detect: find what needs redacting",
	description: "Scan a PDF for sensitive data that should be redacted — SSNs, emails, phones, cards, dates, plus AI detection of names, organisations, and addresses. Then redact it in one step.",
	openGraph: {
		title: "scrubzero — Detect: find what needs redacting",
		description: "Auto-detect the sensitive data in a PDF, review it, and redact — SSNs and cards via regex, names and addresses via AI.",
		url: "https://scrubzero.org/detect",
		siteName: "scrubzero",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "scrubzero — Detect: find what needs redacting",
		description: "Auto-detect the sensitive data in a PDF, review it, and redact.",
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

export default function Detect() {
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
					<span className="mono-label">Sensitive-data detection</span>
					<span className="verdict verdict--pass">
						<span className="verdict__glyph">◎</span> Scan first
					</span>
				</div>
				<div className="h-px mt-5" style={{ background: "var(--rule-strong)" }} />
				<div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 mono-label">
					<span>v{version}</span>
					<span>MIT core</span>
					<span>Regex tier · free</span>
					<span>AI tier · your key</span>
				</div>
			</header>

			{/* ── Hero ─────────────────────────────────────────────────── */}
			<section className="mb-20">
				<h1
					className="leading-[1.0] mb-8"
					style={{ fontFamily: "var(--font-display)", fontSize: "clamp(3rem, 10vw, 5.5rem)", letterSpacing: "-0.01em" }}
				>
					Find what<br />
					<span style={{ fontStyle: "italic" }}>needs redacting.</span>
				</h1>

				<p className="text-base leading-relaxed mb-8" style={{ color: "var(--ink-dim)" }}>
					Point it at a PDF and it surfaces the sensitive data inside — SSNs, emails, phones, cards, dates and IPs
					by deterministic pattern, and <em style={{ fontStyle: "normal", color: "var(--foreground)" }}>names, organisations and addresses</em> by
					AI when you bring a key. Review, then redact — the first step of Detect → Redact → Check.
				</p>
			</section>

			<div className="h-px mb-20" style={{ background: "var(--rule)" }} />

			{/* ── Scan ─────────────────────────────────────────────────── */}
			<section className="mb-20">
				<SectionLabel n="01">Auto-detect</SectionLabel>
				<p className="text-sm mb-6" style={{ color: "var(--ink-dim)" }}>
					Upload a PDF, review what was found, and redact it in one step. No data is stored.
				</p>
				<DetectDemo />
			</section>

			<div className="h-px mb-20" style={{ background: "var(--rule)" }} />

			{/* ── The pipeline ─────────────────────────────────────────── */}
			<section className="mb-20">
				<SectionLabel n="02">Detect → Redact → Check</SectionLabel>
				<div className="flex flex-col divide-y" style={{ borderColor: "var(--rule)" }}>
					{[
						{ n: "01", label: "Detect", body: "Two tiers. A deterministic regex tier (SSN, phone, email, credit card, IP, date) that always runs free and offline. An optional AI tier that finds person names, organisations, and street addresses — the entities patterns can't reliably catch — using your own API key (paid accounts, no key required, are coming)." },
						{ n: "02", label: "Redact", body: "Confirm what to remove and scrubzero scrubs the text operators from the content stream before drawing the bar — no hidden layers, nothing recoverable. The same engine you'd call as @liiift-studio/pdf-redact." },
						{ n: "03", label: "Check", body: "Verify the result. Switch to Check mode and confirm the redaction actually holds — no text under the bar, no recoverable prior revision, no metadata leak." },
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

			{/* ── Footer ───────────────────────────────────────────────── */}
			<footer className="pt-8 flex flex-col gap-6 text-xs" style={{ borderTop: "1px solid var(--rule-strong)" }}>
				<div className="flex flex-col gap-2">
					<span className="mono-label">Next step</span>
					<a href="/" className="group inline-flex items-baseline gap-1 text-sm">
						<span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>Redact</span>
						<span style={{ color: "var(--ink-dim)" }}>— scrub what you found, by pattern or coordinate</span>
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
