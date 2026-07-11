"use client"
// BatchRedactDemo — apply one redaction pattern across many PDFs and download a
// single zip of the redacted files plus a combined audit log. Each file runs
// through the same /api/redact endpoint (which re-verifies its own output), so
// the batch inherits the "prove the negative" self-check per file.

import { useCallback, useState, type DragEvent } from "react"

const MAX_FILES = 25
const MAX_BYTES = 4 * 1024 * 1024

const FOIA_CODES = ["(b)(6)", "(b)(7)(C)", "(b)(5)", "(b)(4)"]

interface Row {
	name: string
	status: "pending" | "ok" | "error"
	redactedCount: number
	clean: boolean | null   // verify() result for this file
	message?: string
}

type State =
	| { status: "idle" }
	| { status: "running"; rows: Row[]; done: number; total: number }
	| { status: "done"; rows: Row[]; zip: Blob }
	| { status: "error"; message: string }

export default function BatchRedactDemo() {
	const [files, setFiles] = useState<File[]>([])
	const [pattern, setPattern] = useState("")
	const [exemptionCode, setExemptionCode] = useState("")
	const [redactorId, setRedactorId] = useState("")
	const [isDragging, setIsDragging] = useState(false)
	const [state, setState] = useState<State>({ status: "idle" })

	const addFiles = useCallback((list: FileList | null) => {
		if (!list) return
		const incoming = [...list].filter((f) => f.name.endsWith(".pdf") || f.type === "application/pdf")
		setFiles((cur) => {
			const merged = [...cur]
			for (const f of incoming) {
				if (f.size > MAX_BYTES) continue
				if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f)
			}
			return merged.slice(0, MAX_FILES)
		})
		setState({ status: "idle" })
	}, [])

	const onDrop = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files) }, [addFiles])

	const run = useCallback(async () => {
		if (files.length === 0) { setState({ status: "error", message: "Add at least one PDF" }); return }
		if (pattern.trim() === "") { setState({ status: "error", message: "Enter a pattern to redact across the batch" }); return }
		const rows: Row[] = files.map((f) => ({ name: f.name, status: "pending", redactedCount: 0, clean: null }))
		setState({ status: "running", rows: [...rows], done: 0, total: files.length })

		const { default: JSZip } = await import("jszip")
		const zip = new JSZip()
		const summary: Array<Record<string, unknown>> = []

		for (let i = 0; i < files.length; i++) {
			const f = files[i]
			const form = new FormData()
			form.set("pdf", f)
			form.set("pattern", pattern.trim())
			if (exemptionCode.trim()) form.set("exemptionCode", exemptionCode.trim())
			if (redactorId.trim()) form.set("redactorId", redactorId.trim())
			try {
				const res = await fetch("/api/redact", { method: "POST", body: form })
				const data = await res.json() as { pdf?: string; redactedCount?: number; verified?: { clean: boolean } | null; manifest?: unknown | null; error?: string }
				if (!res.ok || data.error || !data.pdf) {
					rows[i] = { name: f.name, status: "error", redactedCount: 0, clean: null, message: data.error ?? "failed" }
				} else {
					const bytes = Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0))
					const base = f.name.replace(/\.pdf$/i, "")
					zip.file(`${base}-redacted.pdf`, bytes)
					if (data.manifest != null) zip.file(`${base}-redaction-log.json`, JSON.stringify(data.manifest, null, 2))
					const clean = data.verified ? data.verified.clean : null
					rows[i] = { name: f.name, status: "ok", redactedCount: data.redactedCount ?? 0, clean }
					summary.push({ file: f.name, redactedCount: data.redactedCount ?? 0, verifiedClean: clean })
				}
			} catch {
				rows[i] = { name: f.name, status: "error", redactedCount: 0, clean: null, message: "network error" }
			}
			setState({ status: "running", rows: [...rows], done: i + 1, total: files.length })
		}

		zip.file("batch-summary.json", JSON.stringify({ pattern: pattern.trim(), exemptionCode: exemptionCode.trim() || null, redactorId: redactorId.trim() || null, files: summary }, null, 2))
		const blob = await zip.generateAsync({ type: "blob" })
		setState({ status: "done", rows: [...rows], zip: blob })
	}, [files, pattern, exemptionCode, redactorId])

	const download = useCallback(() => {
		if (state.status !== "done") return
		const url = URL.createObjectURL(state.zip)
		const a = document.createElement("a")
		a.href = url; a.download = "scrubzero-batch.zip"; a.click()
		URL.revokeObjectURL(url)
	}, [state])

	const rows = state.status === "running" || state.status === "done" ? state.rows : null

	return (
		<div className="flex flex-col gap-8">
			{/* Files */}
			<div className="flex flex-col gap-3">
				<p className="mono-label">01 — Add PDFs (up to {MAX_FILES})</p>
				<label
					className="dropzone flex flex-col items-center justify-center gap-2 rounded px-8 py-8 cursor-pointer"
					data-drag={isDragging}
					onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
					onDragLeave={() => setIsDragging(false)}
					onDrop={onDrop}
				>
					<input type="file" accept=".pdf,application/pdf" multiple className="sr-only" onChange={(e) => addFiles(e.target.files)} />
					<p className="text-sm" style={{ color: "var(--ink-dim)" }}>Drop PDFs here, or <span className="underline underline-offset-2" style={{ color: "var(--foreground)" }}>browse</span></p>
					<p className="mono-label" style={{ color: "var(--ink-faint)" }}>Max 4 MB each · {files.length} added</p>
				</label>
				{files.length > 0 && (
					<div className="flex flex-wrap gap-2">
						{files.map((f) => (
							<span key={f.name + f.size} className="text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-2" style={{ border: "1px solid var(--border)", fontFamily: "var(--font-mono)", color: "var(--ink-dim)" }}>
								{f.name}
								<button type="button" onClick={() => setFiles((cur) => cur.filter((x) => !(x.name === f.name && x.size === f.size)))} style={{ color: "var(--ink-faint)" }}>×</button>
							</span>
						))}
					</div>
				)}
			</div>

			{/* Pattern */}
			<div className="flex flex-col gap-3">
				<p className="mono-label">02 — Pattern applied to every file</p>
				<input
					type="text"
					value={pattern}
					onChange={(e) => setPattern(e.target.value)}
					placeholder={`e.g.  ACME Corp  or  /\\d{3}-\\d{2}-\\d{4}/  for SSNs`}
					className="field rounded px-4 py-3 text-sm"
				/>
			</div>

			{/* Optional audit log */}
			<div className="flex flex-col gap-3">
				<p className="mono-label">03 — Exemption code &amp; log (optional)</p>
				<div className="flex flex-wrap gap-2">
					{FOIA_CODES.map((c) => (
						<button key={c} type="button" onClick={() => setExemptionCode((cur) => (cur === c ? "" : c))}
							className="text-xs px-3 py-1.5 rounded-full transition-opacity"
							style={exemptionCode === c ? { background: "var(--btn-bg)", color: "var(--btn-fg)", fontFamily: "var(--font-mono)" } : { border: "1px solid var(--border)", color: "var(--ink-dim)", fontFamily: "var(--font-mono)" }}>
							{c}
						</button>
					))}
				</div>
				<input type="text" value={redactorId} onChange={(e) => setRedactorId(e.target.value)} placeholder="Redactor ID for the logs (optional)" className="field rounded px-4 py-3 text-sm" />
			</div>

			{/* Run */}
			<button
				type="button"
				onClick={run}
				disabled={files.length === 0 || state.status === "running"}
				className="self-start rounded px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
				style={{ background: "var(--btn-bg)", color: "var(--btn-fg)", fontFamily: "var(--font-mono)" }}
			>
				{state.status === "running" ? `Redacting ${state.done}/${state.total}…` : `Redact ${files.length || ""} file${files.length === 1 ? "" : "s"} → zip`}
			</button>

			{state.status === "error" && <div className="alert rounded px-4 py-3 text-sm">{state.message}</div>}

			{/* Per-file results */}
			{rows && rows.some((r) => r.status !== "pending") && (
				<div className="flex flex-col divide-y" style={{ borderColor: "var(--rule)" }}>
					{rows.map((r) => (
						<div key={r.name} className="py-2.5 flex items-center gap-3 text-xs">
							<span style={{ fontFamily: "var(--font-mono)", color: r.status === "error" ? "var(--danger)" : r.status === "ok" ? "var(--verdict-pass)" : "var(--ink-faint)" }}>
								{r.status === "ok" ? "✓" : r.status === "error" ? "✗" : "·"}
							</span>
							<span className="flex-1 truncate">{r.name}</span>
							<span style={{ color: "var(--ink-dim)" }}>
								{r.status === "ok"
									? `${r.redactedCount} redacted${r.clean === false ? " · ⚠ not verifiably clean" : r.clean ? " · verified" : ""}`
									: r.status === "error" ? (r.message ?? "failed") : "…"}
							</span>
						</div>
					))}
				</div>
			)}

			{state.status === "done" && (
				<div className="panel rounded px-5 py-4 flex flex-col gap-3">
					<p className="text-sm font-medium">
						{state.rows.filter((r) => r.status === "ok").length} of {state.rows.length} redacted · zipped with logs and a batch summary
					</p>
					<button type="button" onClick={download} className="self-start rounded px-4 py-2 text-sm transition-opacity hover:opacity-60" style={{ border: "1px solid var(--border)" }}>
						Download batch zip
					</button>
				</div>
			)}
		</div>
	)
}
