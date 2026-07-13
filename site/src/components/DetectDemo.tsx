"use client"
// DetectDemo — scan a PDF for what should be redacted, review, then redact & download.
// Free regex tier always; optional AI tier (bring-your-own Anthropic key).
import { useState, useCallback, type DragEvent } from "react"

interface Finding {
	type: string
	label: string
	count: number
	samples: string[]
	values: string[]
	pages: number[]
	tier: "regex" | "ai"
}

type State =
	| { status: "idle" }
	| { status: "scanning" }
	| { status: "scanned"; findings: Finding[]; pageCount: number; aiUsed: boolean; total: number; scanned: boolean; aiError?: string; aiSource?: string | null; creditsRemaining?: number }
	| { status: "redacting" }
	| { status: "done"; blob: Blob; filename: string; redactedCount: number; manifest: unknown | null }
	| { status: "error"; message: string }

// Default FOIA exemption code for a finding type: privilege markers under (b)(5),
// all PII under (b)(6) personal privacy.
function defaultCode(findingType: string): string {
	return findingType === "attorney-client-marker" ? "(b)(5)" : "(b)(6)"
}

export default function DetectDemo() {
	const [state, setState] = useState<State>({ status: "idle" })
	const [file, setFile] = useState<File | null>(null)
	const [isDragging, setIsDragging] = useState(false)
	const [useAI, setUseAI] = useState(false)
	const [apiKey, setApiKey] = useState("")
	const [foiaLog, setFoiaLog] = useState(false)
	const [redactorId, setRedactorId] = useState("")
	const [selected, setSelected] = useState<Set<string>>(new Set())

	const handleFiles = useCallback((files: FileList | null) => {
		const f = files?.[0]
		if (!f) return
		if (!f.name.endsWith(".pdf") && f.type !== "application/pdf") { setState({ status: "error", message: "Please upload a PDF file" }); return }
		if (f.size > 4 * 1024 * 1024) { setState({ status: "error", message: "File too large — maximum is 4 MB" }); return }
		setFile(f)
		setState({ status: "idle" })
	}, [])

	const scan = useCallback(async () => {
		if (!file) return
		setState({ status: "scanning" })
		const form = new FormData()
		form.set("pdf", file)
		// Send a BYOK key only if one was typed; otherwise the server uses the
		// signed-in account's credits (if any).
		form.set("options", JSON.stringify({ ai: useAI, apiKey: useAI && apiKey.trim() ? apiKey.trim() : undefined }))
		try {
			const res = await fetch("/api/detect", { method: "POST", body: form })
			const data = await res.json() as { findings?: Finding[]; pageCount?: number; aiUsed?: boolean; total?: number; scanned?: boolean; aiError?: string; aiSource?: string | null; creditsRemaining?: number; error?: string }
			if (!res.ok || data.error) { setState({ status: "error", message: data.error ?? "Detection failed" }); return }
			const findings = data.findings ?? []
			setSelected(new Set(findings.map((f) => f.type))) // default: redact everything found
			setState({ status: "scanned", findings, pageCount: data.pageCount ?? 0, aiUsed: !!data.aiUsed, total: data.total ?? 0, scanned: !!data.scanned, aiError: data.aiError, aiSource: data.aiSource, creditsRemaining: data.creditsRemaining })
		} catch {
			setState({ status: "error", message: "Network error — please try again" })
		}
	}, [file, useAI, apiKey])

	const toggle = useCallback((type: string) => {
		setSelected((prev) => {
			const next = new Set(prev)
			next.has(type) ? next.delete(type) : next.add(type)
			return next
		})
	}, [])

	const redact = useCallback(async (findings: Finding[]) => {
		if (!file) return
		const chosen = findings.filter((f) => selected.has(f.type))
		const values = chosen.flatMap((f) => f.values)
		if (values.length === 0) { setState({ status: "error", message: "Select at least one item to redact" }); return }
		setState({ status: "redacting" })
		const form = new FormData()
		form.set("pdf", file)
		if (foiaLog) {
			// Group by finding so each type carries its own exemption code and the
			// server produces a per-redaction audit log.
			const groups = chosen.map((f) => ({ code: defaultCode(f.type), label: f.label, values: f.values }))
			form.set("groups", JSON.stringify(groups))
			if (redactorId.trim()) form.set("redactorId", redactorId.trim())
		} else {
			form.set("strings", JSON.stringify(values))
		}
		try {
			const res = await fetch("/api/redact", { method: "POST", body: form })
			const data = await res.json() as { pdf?: string; redactedCount?: number; manifest?: unknown | null; error?: string }
			if (!res.ok || data.error) { setState({ status: "error", message: data.error ?? "Redaction failed" }); return }
			const bytes = Uint8Array.from(atob(data.pdf!), (c) => c.charCodeAt(0))
			setState({ status: "done", blob: new Blob([bytes], { type: "application/pdf" }), filename: file.name.replace(/\.pdf$/i, "-redacted.pdf"), redactedCount: data.redactedCount ?? 0, manifest: data.manifest ?? null })
		} catch {
			setState({ status: "error", message: "Network error — please try again" })
		}
	}, [file, selected, foiaLog, redactorId])

	const download = useCallback(() => {
		if (state.status !== "done") return
		const url = URL.createObjectURL(state.blob)
		const a = document.createElement("a")
		a.href = url; a.download = state.filename; a.click()
		URL.revokeObjectURL(url)
	}, [state])

	const downloadManifest = useCallback(() => {
		if (state.status !== "done" || !state.manifest) return
		const blob = new Blob([JSON.stringify(state.manifest, null, 2)], { type: "application/json" })
		const url = URL.createObjectURL(blob)
		const a = document.createElement("a")
		a.href = url; a.download = file ? file.name.replace(/\.pdf$/i, "-redaction-log.json") : "redaction-log.json"; a.click()
		URL.revokeObjectURL(url)
	}, [state, file])

	const onDrop = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files) }, [handleFiles])

	return (
		<div className="flex flex-col gap-8">
			{/* Upload */}
			<div className="flex flex-col gap-3">
				<p className="mono-label">01 — Upload PDF</p>
				<label
					className="dropzone flex flex-col items-center justify-center gap-3 rounded px-8 py-10 cursor-pointer"
					data-drag={isDragging}
					onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
					onDragLeave={() => setIsDragging(false)}
					onDrop={onDrop}
				>
					<input type="file" accept=".pdf,application/pdf" className="sr-only" onChange={(e) => handleFiles(e.target.files)} />
					{file ? (
						<>
							<p className="text-sm font-medium">{file.name}</p>
							<p className="mono-label" style={{ color: "var(--ink-faint)" }}>{(file.size / 1024).toFixed(0)} KB · click to replace</p>
						</>
					) : (
						<>
							<p className="text-sm" style={{ color: "var(--ink-dim)" }}>Drop a PDF here, or <span className="underline underline-offset-2" style={{ color: "var(--foreground)" }}>browse</span></p>
							<p className="mono-label" style={{ color: "var(--ink-faint)" }}>Max 4 MB · no data is stored</p>
						</>
					)}
				</label>
			</div>

			{/* AI tier */}
			<div className="flex flex-col gap-3">
				<p className="mono-label">02 — Detection depth</p>
				<label className="flex items-start gap-3 cursor-pointer">
					<input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} className="mt-0.5" style={{ accentColor: "var(--foreground)" }} />
					<span className="text-xs leading-relaxed" style={{ color: "var(--ink-dim)" }}>
						<span className="font-medium" style={{ color: "var(--foreground)" }}>AI detection</span> — names, organisations, and addresses that regex can&apos;t catch.
						<span> Regex entities (SSN, email, phone, cards, dates, IPs) always run.</span>
					</span>
				</label>
				{useAI && (
					<div className="panel rounded px-4 py-3 flex flex-col gap-2">
						<input
							type="password"
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							placeholder="Anthropic API key — sk-ant-…  (optional)"
							className="field rounded px-3 py-2 text-xs font-mono"
							autoComplete="off"
						/>
						<p className="mono-label" style={{ color: "var(--ink-faint)", letterSpacing: "0.08em" }}>
							Bring your own key (used once, never stored) — or leave it blank and <a href="/account" className="underline" style={{ color: "var(--ink-dim)" }}>sign in</a> for 500 free scans, then 1 credit per scan.
						</p>
					</div>
				)}
			</div>

			{/* Scan */}
			<button
				type="button"
				onClick={scan}
				disabled={!file || state.status === "scanning"}
				className="self-start rounded px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
				style={{ background: "var(--btn-bg)", color: "var(--btn-fg)", fontFamily: "var(--font-mono)" }}
			>
				{state.status === "scanning" ? "Scanning…" : "Scan for sensitive data"}
			</button>

			{state.status === "error" && <div className="alert rounded px-4 py-3 text-sm">{state.message}</div>}

			{/* Scanned-PDF caution: detection reads the text layer, which a scan lacks. */}
			{state.status === "scanned" && state.scanned && (
				<div className="alert rounded px-4 py-3 flex flex-col gap-1.5" data-tone="warn">
					<p className="text-xs font-medium" style={{ letterSpacing: "0.04em" }}>⚠ This looks like a scanned or image-only PDF</p>
					<p className="text-xs leading-relaxed" style={{ color: "var(--ink-dim)" }}>
						Detection reads the document&apos;s text layer — a scan has none, so anything sensitive here lives in the page image and <em style={{ fontStyle: "normal", color: "var(--foreground)" }}>cannot be found or redacted by text tools</em>. A &ldquo;nothing found&rdquo; result does not mean the page is clean. Run the page through OCR first, or rasterise-and-replace to truly redact it.
					</p>
				</div>
			)}

			{/* AI tier couldn't run — tell the user what to do about it. */}
			{state.status === "scanned" && state.aiError && (
				<div className="alert rounded px-4 py-3 flex flex-col gap-1.5" data-tone="warn">
					{state.aiError === "sign-in-required" ? (
						<p className="text-xs leading-relaxed" style={{ color: "var(--ink-dim)" }}>
							AI detection didn&apos;t run — it needs your own Anthropic key, or an account. <a href="/account" className="underline" style={{ color: "var(--foreground)" }}>Sign in for 500 free scans →</a> Regex results below still ran.
						</p>
					) : state.aiError === "insufficient-credits" ? (
						<p className="text-xs leading-relaxed" style={{ color: "var(--ink-dim)" }}>
							You&apos;re out of AI credits ({state.creditsRemaining ?? 0} left). <a href="/account" className="underline" style={{ color: "var(--foreground)" }}>Buy more →</a> or paste your own key above. Regex results below still ran.
						</p>
					) : (
						<p className="text-xs leading-relaxed" style={{ color: "var(--ink-dim)" }}>
							AI detection needs your own Anthropic key on this deployment — paste one above. Regex results below still ran.
						</p>
					)}
				</div>
			)}

			{/* Findings */}
			{state.status === "scanned" && (
				state.findings.length === 0 ? (
					state.scanned ? null : (
					<div className="panel rounded px-4 py-4 text-sm" style={{ color: "var(--verdict-pass)" }}>
						No sensitive data detected across {state.pageCount} page{state.pageCount !== 1 ? "s" : ""}.
						{state.aiUsed ? " (regex + AI)" : " (regex only — enable AI for names & addresses)"}
					</div>
					)
				) : (
					<div className="flex flex-col gap-4">
						<p className="text-sm">
							<span className="font-medium">{state.total} item{state.total !== 1 ? "s" : ""} to review</span>
							<span className="ml-2 text-xs" style={{ color: "var(--ink-dim)" }}>across {state.pageCount} page{state.pageCount !== 1 ? "s" : ""}{state.aiUsed ? " · regex + AI" : " · regex"}</span>
						</p>
						<div className="flex flex-col gap-2">
							{state.findings.map((f) => (
								<label key={f.type} className="panel rounded px-4 py-3 flex items-start gap-3 cursor-pointer">
									<input type="checkbox" checked={selected.has(f.type)} onChange={() => toggle(f.type)} className="mt-1" style={{ accentColor: "var(--foreground)" }} />
									<div className="flex flex-col gap-1.5 min-w-0 flex-1">
										<div className="flex items-center gap-2 flex-wrap">
											<span className="text-sm font-medium">{f.label}</span>
											<span className="text-[10px] px-1.5 py-0.5 rounded-sm" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.08em", border: "1px solid var(--border-strong)", color: f.tier === "ai" ? "var(--verdict-pass)" : "var(--ink-dim)" }}>
												{f.tier === "ai" ? "AI" : "REGEX"}
											</span>
											<span className="mono-label" style={{ color: "var(--ink-faint)" }}>{f.count}× · p.{f.pages.slice(0, 6).join(", ")}{f.pages.length > 6 ? "…" : ""}</span>
										</div>
										<p className="text-xs font-mono truncate" style={{ color: "var(--ink-dim)" }}>{f.samples.join("   ·   ")}{f.count > f.samples.length ? "  …" : ""}</p>
									</div>
								</label>
							))}
						</div>
						{/* FOIA audit log: stamp exemption codes per type and produce a log. */}
						<div className="panel rounded px-4 py-3 flex flex-col gap-2">
							<label className="flex items-start gap-3 cursor-pointer">
								<input type="checkbox" checked={foiaLog} onChange={(e) => setFoiaLog(e.target.checked)} className="mt-0.5" style={{ accentColor: "var(--foreground)" }} />
								<span className="text-xs leading-relaxed" style={{ color: "var(--ink-dim)" }}>
									<span className="font-medium" style={{ color: "var(--foreground)" }}>FOIA audit log</span> — stamp each type&apos;s exemption code on the bar ((b)(6) for PII, (b)(5) for privilege) and produce a downloadable per-redaction log.
								</span>
							</label>
							{foiaLog && (
								<input
									type="text"
									value={redactorId}
									onChange={(e) => setRedactorId(e.target.value)}
									placeholder="Redactor ID for the log (optional) — e.g. agent-7"
									className="field rounded px-3 py-2 text-xs font-mono"
								/>
							)}
						</div>
						<button
							type="button"
							onClick={() => redact(state.findings)}
							className="self-start rounded px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
							style={{ background: "var(--btn-bg)", color: "var(--btn-fg)", fontFamily: "var(--font-mono)" }}
						>
							Redact selected &amp; download →
						</button>
					</div>
				)
			)}

			{state.status === "redacting" && <p className="text-sm" style={{ color: "var(--ink-dim)" }}>Redacting…</p>}

			{state.status === "done" && (
				<div className="panel rounded px-5 py-4 flex flex-col gap-3">
					<p className="text-sm font-medium">{state.redactedCount} region{state.redactedCount !== 1 ? "s" : ""} redacted</p>
					<div className="flex flex-wrap gap-3">
						<button type="button" onClick={download} className="rounded px-4 py-2 text-sm transition-opacity hover:opacity-60" style={{ border: "1px solid var(--border)" }}>
							Download redacted PDF
						</button>
						{state.manifest != null && (
							<button type="button" onClick={downloadManifest} className="rounded px-4 py-2 text-sm transition-opacity hover:opacity-60" style={{ border: "1px solid var(--border)" }}>
								Download redaction log (JSON)
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	)
}
