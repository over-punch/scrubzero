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
	| { status: "scanned"; findings: Finding[]; pageCount: number; aiUsed: boolean; total: number }
	| { status: "redacting" }
	| { status: "done"; blob: Blob; filename: string; redactedCount: number }
	| { status: "error"; message: string }

export default function DetectDemo() {
	const [state, setState] = useState<State>({ status: "idle" })
	const [file, setFile] = useState<File | null>(null)
	const [isDragging, setIsDragging] = useState(false)
	const [useAI, setUseAI] = useState(false)
	const [apiKey, setApiKey] = useState("")
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
		form.set("options", JSON.stringify({ ai: useAI, apiKey: useAI ? apiKey : undefined }))
		try {
			const res = await fetch("/api/detect", { method: "POST", body: form })
			const data = await res.json() as { findings?: Finding[]; pageCount?: number; aiUsed?: boolean; total?: number; error?: string }
			if (!res.ok || data.error) { setState({ status: "error", message: data.error ?? "Detection failed" }); return }
			const findings = data.findings ?? []
			setSelected(new Set(findings.map((f) => f.type))) // default: redact everything found
			setState({ status: "scanned", findings, pageCount: data.pageCount ?? 0, aiUsed: !!data.aiUsed, total: data.total ?? 0 })
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
		const values = findings.filter((f) => selected.has(f.type)).flatMap((f) => f.values)
		if (values.length === 0) { setState({ status: "error", message: "Select at least one item to redact" }); return }
		setState({ status: "redacting" })
		const form = new FormData()
		form.set("pdf", file)
		form.set("strings", JSON.stringify(values))
		try {
			const res = await fetch("/api/redact", { method: "POST", body: form })
			const data = await res.json() as { pdf?: string; redactedCount?: number; error?: string }
			if (!res.ok || data.error) { setState({ status: "error", message: data.error ?? "Redaction failed" }); return }
			const bytes = Uint8Array.from(atob(data.pdf!), (c) => c.charCodeAt(0))
			setState({ status: "done", blob: new Blob([bytes], { type: "application/pdf" }), filename: file.name.replace(/\.pdf$/i, "-redacted.pdf"), redactedCount: data.redactedCount ?? 0 })
		} catch {
			setState({ status: "error", message: "Network error — please try again" })
		}
	}, [file, selected])

	const download = useCallback(() => {
		if (state.status !== "done") return
		const url = URL.createObjectURL(state.blob)
		const a = document.createElement("a")
		a.href = url; a.download = state.filename; a.click()
		URL.revokeObjectURL(url)
	}, [state])

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
							placeholder="Anthropic API key — sk-ant-…"
							className="field rounded px-3 py-2 text-xs font-mono"
							autoComplete="off"
						/>
						<p className="mono-label" style={{ color: "var(--ink-faint)", letterSpacing: "0.08em" }}>
							Used once for this scan · never stored or logged · paid accounts (no key needed) coming soon
						</p>
					</div>
				)}
			</div>

			{/* Scan */}
			<button
				type="button"
				onClick={scan}
				disabled={!file || state.status === "scanning" || (useAI && apiKey.trim() === "")}
				className="self-start rounded px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
				style={{ background: "var(--btn-bg)", color: "var(--btn-fg)", fontFamily: "var(--font-mono)" }}
			>
				{state.status === "scanning" ? "Scanning…" : "Scan for sensitive data"}
			</button>

			{state.status === "error" && <div className="alert rounded px-4 py-3 text-sm">{state.message}</div>}

			{/* Findings */}
			{state.status === "scanned" && (
				state.findings.length === 0 ? (
					<div className="panel rounded px-4 py-4 text-sm" style={{ color: "var(--verdict-pass)" }}>
						No sensitive data detected across {state.pageCount} page{state.pageCount !== 1 ? "s" : ""}.
						{state.aiUsed ? " (regex + AI)" : " (regex only — enable AI for names & addresses)"}
					</div>
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
					<button type="button" onClick={download} className="self-start rounded px-4 py-2 text-sm transition-opacity hover:opacity-60" style={{ border: "1px solid var(--border)" }}>
						Download redacted PDF
					</button>
				</div>
			)}
		</div>
	)
}
