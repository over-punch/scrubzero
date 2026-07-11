"use client"
// AuditDemo — drag-and-drop PDF upload with live audit results and Tier 2/3 toggles.

import { useState, useRef, useCallback, type DragEvent } from "react"

interface CandidateString {
	text: string
	confidence: number
	reasoning: string
}

interface Finding {
	check: string
	severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"
	page?: number
	bbox?: [number, number, number, number]
	detail: string
	recoveredText?: string
	candidates?: CandidateString[]
}

interface AuditReport {
	clean: boolean
	findings: Finding[]
	checkedAt: string
	sha256: string
}

type State =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "done"; report: AuditReport; filename: string }
	| { status: "error"; message: string }

const SEVERITY_STYLE: Record<Finding["severity"], React.CSSProperties> = {
	CRITICAL: { background: "var(--stamp)", color: "#fff" },
	HIGH: { border: "1px solid var(--stamp)", color: "var(--stamp)" },
	MEDIUM: { border: "1px solid var(--border-strong)", color: "var(--ink-dim)" },
	LOW: { border: "1px solid var(--border-strong)", color: "var(--ink-dim)" },
	INFO: { border: "1px solid var(--border)", color: "var(--ink-faint)" },
}

const CHECK_LABELS: Record<string, string> = {
	"text-under-box": "Text under box",
	"incremental-save": "Incremental save",
	"metadata-leak": "Metadata leak",
	"pending-annotation": "Pending annotation",
	"glyph-position": "Glyph position",
}

export default function AuditDemo() {
	const [state, setState] = useState<State>({ status: "idle" })
	const [isDragging, setIsDragging] = useState(false)
	const [tier2, setTier2] = useState(false)
	const [tier3, setTier3] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)

	const runAudit = useCallback(async (file: File) => {
		setState({ status: "loading" })
		const form = new FormData()
		form.append("pdf", file)
		form.append("options", JSON.stringify({ glyphPositionLeak: tier2, patternOracle: tier3 }))
		try {
			const res = await fetch("/api/audit", { method: "POST", body: form })
			const data = await res.json() as { report?: AuditReport; error?: string }
			if (!res.ok || data.error) {
				setState({ status: "error", message: data.error ?? "Audit failed" })
			} else {
				setState({ status: "done", report: data.report!, filename: file.name })
			}
		} catch {
			setState({ status: "error", message: "Network error — please try again" })
		}
	}, [tier2, tier3])

	const handleFiles = useCallback((files: FileList | null) => {
		const file = files?.[0]
		if (!file) return
		if (!file.name.endsWith(".pdf") && file.type !== "application/pdf") {
			setState({ status: "error", message: "Please upload a PDF file" })
			return
		}
		if (file.size > 4 * 1024 * 1024) {
			setState({ status: "error", message: "File too large — maximum is 4 MB" })
			return
		}
		void runAudit(file)
	}, [runAudit])

	const onDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
	const onDragLeave = useCallback(() => setIsDragging(false), [])
	const onDrop = useCallback((e: DragEvent) => {
		e.preventDefault()
		setIsDragging(false)
		handleFiles(e.dataTransfer.files)
	}, [handleFiles])

	return (
		<div className="flex flex-col gap-6">
			{/* Tier options */}
			<div className="flex flex-col gap-2">
				<p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--ink-dim)" }}>Analysis depth</p>
				<div className="flex flex-col gap-2 mt-1">
					<label className="flex items-start gap-3 cursor-pointer group">
						<input
							type="checkbox"
							checked={tier2}
							onChange={e => setTier2(e.target.checked)}
							className="mt-0.5"
							style={{ accentColor: "var(--foreground)" }}
						/>
						<span className="text-xs leading-relaxed" style={{ color: "var(--ink-dim)" }}>
							<span className="font-medium" style={{ color: "var(--foreground)" }}>Tier 2</span> — Glyph position analysis
							<span> · slower · requires embedded fonts</span>
						</span>
					</label>
					<label className="flex items-start gap-3 cursor-pointer group">
						<input
							type="checkbox"
							checked={tier3}
							onChange={e => setTier3(e.target.checked)}
							className="mt-0.5"
							style={{ accentColor: "var(--foreground)" }}
						/>
						<span className="text-xs leading-relaxed" style={{ color: "var(--ink-dim)" }}>
							<span className="font-medium" style={{ color: "var(--foreground)" }}>Tier 3</span> — Pattern oracle: AI candidate ranking
							<span> · requires ANTHROPIC_API_KEY</span>
						</span>
					</label>
				</div>
			</div>

			{/* Drop zone */}
			<label
				className={`dropzone flex flex-col items-center justify-center gap-3 rounded px-8 py-10 cursor-pointer ${state.status === "loading" ? "pointer-events-none opacity-50" : ""}`}
				data-drag={isDragging}
				onDragOver={onDragOver}
				onDragLeave={onDragLeave}
				onDrop={onDrop}
			>
				<input
					ref={inputRef}
					type="file"
					accept=".pdf,application/pdf"
					className="sr-only"
					onChange={e => handleFiles(e.target.files)}
				/>
				{state.status === "loading" ? (
					<>
						<div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--border-strong)" }} />
						<p className="text-sm" style={{ color: "var(--ink-dim)" }}>
							{tier3 ? "AI oracle running…" : "Auditing…"}
						</p>
					</>
				) : (
					<>
						<svg width="28" height="28" viewBox="0 0 32 32" fill="none" className="opacity-25">
							<path d="M16 6v14M16 6l-5 5M16 6l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
							<path d="M6 22v2a2 2 0 002 2h16a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
						</svg>
						<p className="text-sm" style={{ color: "var(--ink-dim)" }}>
							Drop a PDF here, or <span className="underline underline-offset-2" style={{ color: "var(--foreground)" }}>browse</span>
						</p>
						<p className="mono-label" style={{ color: "var(--ink-faint)" }}>Max 4 MB · no data is stored</p>
					</>
				)}
			</label>

			{/* Error */}
			{state.status === "error" && (
				<div className="alert rounded px-4 py-3 text-sm">
					{state.message}
				</div>
			)}

			{/* Results */}
			{state.status === "done" && (
				<div className="flex flex-col gap-4">
					<div className="flex items-center justify-between">
						<p className="text-xs font-mono truncate" style={{ color: "var(--ink-dim)" }}>{state.filename}</p>
						<button
							onClick={() => setState({ status: "idle" })}
							className="text-xs ml-4 shrink-0 hover:opacity-60 transition-opacity"
							style={{ color: "var(--ink-dim)" }}
						>
							Clear
						</button>
					</div>

					{state.report.clean ? (
						<div className="panel flex items-center gap-3 rounded px-4 py-4" style={{ color: "var(--verdict-pass)" }}>
							<svg width="16" height="16" viewBox="0 0 18 18" fill="none" className="shrink-0 opacity-60">
								<circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5"/>
								<path d="M5.5 9l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
							</svg>
							<div>
								<p className="text-sm font-medium">No issues detected</p>
								<p className="text-xs mt-0.5" style={{ color: "var(--ink-dim)" }}>
									{tier3 ? "Tier 1–3 checks passed" : tier2 ? "Tier 1–2 checks passed" : "All Tier 1 checks passed"}
								</p>
							</div>
						</div>
					) : (
						<div className="flex flex-col gap-3">
							<p className="text-sm">
								<span className="font-medium">{state.report.findings.length} issue{state.report.findings.length !== 1 ? "s" : ""} found</span>
								<span className="ml-2 text-xs" style={{ color: "var(--ink-dim)" }}>this PDF may not be securely redacted</span>
							</p>

							{/* Check exposes the problem — the fix is Redact. Make that path obvious. */}
							<a
								href="/"
								className="group self-start inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
								style={{ background: "var(--btn-bg)", color: "var(--btn-fg)", fontFamily: "var(--font-mono)" }}
							>
								Redact it properly
								<span className="transition-transform group-hover:translate-x-0.5">→</span>
							</a>

							{state.report.findings.map((f, i) => (
								<div key={i} className="panel rounded px-4 py-3 flex flex-col gap-2">
									<div className="flex items-center gap-2 flex-wrap">
										<span className="text-[10px] px-2 py-0.5 rounded-sm" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.1em", ...SEVERITY_STYLE[f.severity] }}>
											{f.severity}
										</span>
										<span className="text-xs font-medium">
											{CHECK_LABELS[f.check] ?? f.check}
										</span>
										{f.page && (
											<span className="text-xs font-mono" style={{ color: "var(--ink-dim)" }}>p.{f.page}</span>
										)}
									</div>
									<p className="text-xs leading-relaxed" style={{ color: "var(--ink-dim)" }}>{f.detail}</p>

									{f.recoveredText && (
										<div
											className="rounded px-3 py-2 text-xs font-mono"
											style={{ background: "var(--code-bg)", border: "1px solid var(--border)" }}
										>
											{f.recoveredText}
										</div>
									)}

									{f.candidates && f.candidates.length > 0 && (
										<div className="flex flex-col gap-1 mt-1">
											<p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-dim)" }}>AI oracle candidates</p>
											{f.candidates.slice(0, 3).map((c, ci) => (
												<div key={ci} className="flex items-start gap-3 text-xs font-mono">
													<span className="shrink-0 tabular-nums" style={{ color: "var(--ink-dim)" }}>
														{(c.confidence * 100).toFixed(0)}%
													</span>
													<span>{c.text}</span>
												</div>
											))}
										</div>
									)}
								</div>
							))}

							<p className="text-xs font-mono" style={{ color: "var(--ink-dim)", opacity: 0.5 }}>
								SHA-256 {state.report.sha256.slice(0, 16)}…
							</p>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
