"use client"
// RedactDemo — upload a PDF and a search pattern; download the redacted result.

import { useState, useRef, useCallback, type DragEvent, type FormEvent } from "react"

type State =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "done"; redactedCount: number; pagesAffected: number[]; blob: Blob; filename: string; scanned: boolean; warnings: string[] }
	| { status: "error"; message: string }

export default function RedactDemo() {
	const [state, setState] = useState<State>({ status: "idle" })
	const [isDragging, setIsDragging] = useState(false)
	const [file, setFile] = useState<File | null>(null)
	const [color, setColor] = useState("#111111")
	const inputRef = useRef<HTMLInputElement>(null)

	const handleFiles = useCallback((files: FileList | null) => {
		const f = files?.[0]
		if (!f) return
		if (!f.name.endsWith(".pdf") && f.type !== "application/pdf") {
			setState({ status: "error", message: "Please upload a PDF file" })
			return
		}
		if (f.size > 4 * 1024 * 1024) {
			setState({ status: "error", message: "File too large — maximum is 4 MB" })
			return
		}
		setFile(f)
		setState({ status: "idle" })
	}, [])

	const onDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
	const onDragLeave = useCallback(() => setIsDragging(false), [])
	const onDrop = useCallback((e: DragEvent) => {
		e.preventDefault()
		setIsDragging(false)
		handleFiles(e.dataTransfer.files)
	}, [handleFiles])

	const handleSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		if (!file) return
		const form = new FormData(e.currentTarget)
		form.set("pdf", file)
		form.set("color", color)

		setState({ status: "loading" })
		try {
			const res = await fetch("/api/redact", { method: "POST", body: form })
			const data = await res.json() as { pdf?: string; redactedCount?: number; pagesAffected?: number[]; scanned?: boolean; warnings?: string[]; error?: string }
			if (!res.ok || data.error) {
				setState({ status: "error", message: data.error ?? "Redaction failed" })
			} else {
				const bytes = Uint8Array.from(atob(data.pdf!), c => c.charCodeAt(0))
				const blob = new Blob([bytes], { type: "application/pdf" })
				setState({
					status: "done",
					redactedCount: data.redactedCount ?? 0,
					pagesAffected: data.pagesAffected ?? [],
					blob,
					filename: file.name.replace(/\.pdf$/i, "-redacted.pdf"),
					scanned: data.scanned ?? false,
					warnings: data.warnings ?? [],
				})
			}
		} catch {
			setState({ status: "error", message: "Network error — please try again" })
		}
	}, [file, color])

	const downloadResult = useCallback(() => {
		if (state.status !== "done") return
		const url = URL.createObjectURL(state.blob)
		const a = document.createElement("a")
		a.href = url
		a.download = state.filename
		a.click()
		URL.revokeObjectURL(url)
	}, [state])

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-8">
			{/* Step 1 — drop zone */}
			<div className="flex flex-col gap-3">
				<p className="mono-label">01 — Upload PDF</p>
				<label
					className="dropzone flex flex-col items-center justify-center gap-3 rounded px-8 py-10 cursor-pointer"
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
					{file ? (
						<>
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="opacity-60">
								<path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
								<circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
							</svg>
							<p className="text-sm font-medium">{file.name}</p>
							<p className="text-xs" style={{ color: "var(--ink-dim)" }}>{(file.size / 1024).toFixed(0)} KB · click to replace</p>
						</>
					) : (
						<>
							<svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="opacity-25">
								<path d="M14 5v12M14 5l-4 4M14 5l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
								<path d="M5 19v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
							</svg>
							<p className="text-sm" style={{ color: "var(--ink-dim)" }}>
								Drop a PDF here, or <span className="underline underline-offset-2" style={{ color: "var(--foreground)" }}>browse</span>
							</p>
							<p className="mono-label" style={{ color: "var(--ink-faint)" }}>Max 4 MB</p>
						</>
					)}
				</label>
			</div>

			{/* Step 2 — pattern */}
			<div className="flex flex-col gap-3">
				<p className="mono-label">02 — Search pattern</p>
				<input
					type="text"
					name="pattern"
					required
					placeholder={`e.g.  John Smith  or  /\\d{3}-\\d{2}-\\d{4}/  for SSNs`}
					className="field rounded px-4 py-3 text-sm"
				/>
				<p className="text-xs" style={{ color: "var(--ink-dim)" }}>
					Plain text or <code className="font-mono text-xs px-1 rounded" style={{ background: "var(--surface-2)" }}>/regex/flags</code> — all matches on every page are redacted
				</p>
			</div>

			{/* Step 3 — color */}
			<div className="flex flex-col gap-3">
				<p className="mono-label">03 — Bar color</p>
				<div className="flex items-center gap-3">
					<input
						type="color"
						value={color}
						onChange={e => setColor(e.target.value)}
						className="w-9 h-9 rounded cursor-pointer p-0.5 bg-transparent"
						style={{ border: "1px solid var(--border)" }}
					/>
					<span className="text-sm font-mono" style={{ color: "var(--ink-dim)" }}>{color}</span>
				</div>
			</div>

			{/* Submit */}
			<button
				type="submit"
				disabled={!file || state.status === "loading"}
				className="self-start rounded px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
				style={{ background: "var(--btn-bg)", color: "var(--btn-fg)" }}
			>
				{state.status === "loading" ? (
					<span className="flex items-center gap-2">
						<span className="w-3.5 h-3.5 border-2 border-[var(--btn-fg)]/20 border-t-[var(--btn-fg)]/70 rounded-full animate-spin" />
						Redacting…
					</span>
				) : "Redact PDF"}
			</button>

			{/* Error */}
			{state.status === "error" && (
				<div className="alert rounded px-4 py-3 text-sm">
					{state.message}
				</div>
			)}

			{/* Result */}
			{state.status === "done" && (
				<div className="panel flex flex-col gap-3 rounded px-5 py-4">
					<div className="flex items-center gap-2">
						<svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="shrink-0 opacity-60">
							<circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/>
							<path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
						</svg>
						<p className="text-sm font-medium">
							{state.redactedCount} region{state.redactedCount !== 1 ? "s" : ""} redacted
							{state.pagesAffected.length > 0 && (
								<span className="font-normal ml-1" style={{ color: "var(--ink-dim)" }}>
									on page{state.pagesAffected.length !== 1 ? "s" : ""} {state.pagesAffected.join(", ")}
								</span>
							)}
						</p>
					</div>

					{/* Honest caution: a bar over a scan or image removes nothing. */}
					{state.warnings.length > 0 && (
						<div className="alert rounded px-4 py-3 flex flex-col gap-2" data-tone="warn">
							<p className="text-xs font-medium" style={{ letterSpacing: "0.04em" }}>
								⚠ Not everything was removed
							</p>
							{state.warnings.map((w, i) => (
								<p key={i} className="text-xs leading-relaxed" style={{ color: "var(--ink-dim)" }}>{w}</p>
							))}
						</div>
					)}

					<button
						type="button"
						onClick={downloadResult}
						className="self-start rounded px-4 py-2 text-sm transition-opacity hover:opacity-60"
						style={{ border: "1px solid var(--border)" }}
					>
						Download redacted PDF
					</button>
				</div>
			)}
		</form>
	)
}
