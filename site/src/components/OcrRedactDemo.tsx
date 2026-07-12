"use client"
// OcrRedactDemo — true redaction for SCANNED PDFs, entirely in the browser.
//
// A scanned page is an image, so a vector bar over it removes nothing. This flow
// OCRs each page to find sensitive text, BURNS opaque boxes into the raster
// pixels, and rebuilds the PDF from the redacted page images — the original
// pixels are destroyed, not covered. Everything runs client-side (pdfjs render +
// tesseract.js OCR + pdf-lib rebuild), so the file never leaves the device.

import { useCallback, useRef, useState, type DragEvent } from "react"

// The regex entity types offered for a scan. Names/addresses need AI (server,
// text-layer only), so they are intentionally excluded here — use a custom
// pattern for a specific name.
const ENTITY_CHOICES: { key: string; label: string }[] = [
	{ key: "ssn", label: "SSN" },
	{ key: "phone", label: "Phone" },
	{ key: "email", label: "Email" },
	{ key: "credit-card", label: "Credit card" },
	{ key: "ip-address", label: "IP address" },
	{ key: "date", label: "Date" },
]

type State =
	| { status: "idle" }
	| { status: "running"; message: string; progress: number }
	| { status: "done"; blob: Blob; filename: string; redactedCount: number; pageCount: number; matched: boolean }
	| { status: "error"; message: string }

// One OCR word with its pixel bounding box in the rendered canvas.
interface OcrWord { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }
// One OCR line: the words on it, in reading order.
interface OcrLine { words: OcrWord[] }

// Flatten tesseract's block hierarchy (blocks > paragraphs > lines > words) to lines.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function linesFromBlocks(blocks: any[]): OcrLine[] {
	const lines: OcrLine[] = []
	for (const b of blocks ?? []) {
		for (const p of b.paragraphs ?? []) {
			for (const l of p.lines ?? []) {
				const words: OcrWord[] = (l.words ?? [])
					.filter((w: { text?: string }) => w.text && w.text.trim() !== "")
					.map((w: { text: string; bbox: OcrWord["bbox"] }) => ({ text: w.text, bbox: w.bbox }))
				if (words.length) lines.push({ words })
			}
		}
	}
	return lines
}

// Build the redaction regex list from the selected entity types + a custom pattern.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPatterns(entityPatterns: Record<string, { pattern: RegExp }>, selected: Set<string>, custom: string): RegExp[] {
	const out: RegExp[] = []
	for (const key of selected) {
		const def = entityPatterns[key]
		if (!def) continue
		const flags = def.pattern.flags.includes("g") ? def.pattern.flags : def.pattern.flags + "g"
		out.push(new RegExp(def.pattern.source, flags))
	}
	const c = custom.trim()
	if (c) {
		const rx = c.match(/^\/(.+)\/([gimsuy]*)$/)
		try {
			if (rx) out.push(new RegExp(rx[1]!, rx[2]!.includes("g") ? rx[2]! : rx[2]! + "g"))
			else out.push(new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"))
		} catch { /* ignore an invalid custom regex */ }
	}
	return out
}

export default function OcrRedactDemo() {
	const [state, setState] = useState<State>({ status: "idle" })
	const [file, setFile] = useState<File | null>(null)
	const [isDragging, setIsDragging] = useState(false)
	const [selected, setSelected] = useState<Set<string>>(new Set(["ssn", "phone", "email", "credit-card"]))
	const [custom, setCustom] = useState("")
	const [color, setColor] = useState("#000000")
	const cancelRef = useRef(false)

	const handleFiles = useCallback((files: FileList | null) => {
		const f = files?.[0]
		if (!f) return
		if (!f.name.endsWith(".pdf") && f.type !== "application/pdf") { setState({ status: "error", message: "Please upload a PDF file" }); return }
		if (f.size > 20 * 1024 * 1024) { setState({ status: "error", message: "File too large — maximum is 20 MB for OCR" }); return }
		setFile(f)
		setState({ status: "idle" })
	}, [])

	const toggle = useCallback((key: string) => {
		setSelected((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
	}, [])

	const run = useCallback(async () => {
		if (!file) return
		if (selected.size === 0 && custom.trim() === "") { setState({ status: "error", message: "Pick at least one type or enter a pattern to redact" }); return }
		cancelRef.current = false
		setState({ status: "running", message: "Loading OCR engine…", progress: 0.02 })

		// pdfjs schedules its render loop with requestAnimationFrame, which the
		// browser PAUSES in a hidden/background tab — so a user who switches away
		// mid-run would see rendering stall. Route rAF through a timer for the
		// duration of the run (rendering is to a detached canvas, so there's no
		// visual smoothness to lose); restored in the finally below. OCR itself
		// runs in a Web Worker and is already unaffected by tab visibility.
		const origRaf = window.requestAnimationFrame
		window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 0) as unknown as number

		try {
			const [pdfjsLib, tesseract, { PDFDocument }, pkg] = await Promise.all([
				import("pdfjs-dist"),        // named exports: getDocument, GlobalWorkerOptions, version
				import("tesseract.js"),
				import("pdf-lib"),
				import("scrubzero"),
			])
			// pdfjs needs a worker; load the matching version from CDN (normal web app, no CSP block).
			pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

			const entityPatterns = (pkg as { EntityPatterns: Record<string, { pattern: RegExp }> }).EntityPatterns
			const patterns = buildPatterns(entityPatterns, selected, custom)
			const [r, g, b] = hexToRgb(color)

			const data = new Uint8Array(await file.arrayBuffer())
			const doc = await pdfjsLib.getDocument({ data }).promise
			const pageCount = doc.numPages

			const worker = await tesseract.createWorker("eng", 1, {
				logger: () => {}, // per-page progress is driven below, not by the noisy word logger
			})

			const out = await PDFDocument.create()
			const SCALE = 2 // render at ~144dpi for OCR accuracy
			let redactedCount = 0

			for (let n = 1; n <= pageCount; n++) {
				if (cancelRef.current) { await worker.terminate(); setState({ status: "idle" }); return }
				const base = 0.05 + 0.9 * ((n - 1) / pageCount)
				setState({ status: "running", message: `Reading page ${n} of ${pageCount}…`, progress: base })

				const page = await doc.getPage(n)
				const pts = page.getViewport({ scale: 1 })          // page size in PDF points
				const viewport = page.getViewport({ scale: SCALE }) // render resolution
				const canvas = document.createElement("canvas")
				canvas.width = Math.ceil(viewport.width)
				canvas.height = Math.ceil(viewport.height)
				const ctx = canvas.getContext("2d")!
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				await page.render({ canvasContext: ctx as any, viewport }).promise

				// OCR the rendered page → word boxes in canvas pixel space.
				const { data: ocr } = await worker.recognize(canvas, {}, { blocks: true })
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const lines = linesFromBlocks((ocr as any).blocks ?? [])

				// Match patterns across each line and burn boxes over matched words.
				ctx.fillStyle = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
				for (const line of lines) {
					const offsets: number[] = []
					let text = ""
					line.words.forEach((w, i) => { offsets.push(text.length); text += w.text; if (i < line.words.length - 1) text += " " })
					const hit = new Set<number>()
					for (const re of patterns) {
						re.lastIndex = 0
						let m: RegExpExecArray | null
						while ((m = re.exec(text)) !== null) {
							const ms = m.index, me = ms + m[0].length
							line.words.forEach((w, i) => {
								const ws = offsets[i], we = ws + w.text.length
								if (we > ms && ws < me) hit.add(i)
							})
							if (m[0].length === 0) re.lastIndex++
						}
					}
					for (const i of hit) {
						const { x0, y0, x1, y1 } = line.words[i].bbox
						ctx.fillRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4)
						redactedCount++
					}
				}

				// Flatten: the redacted raster becomes the page. Nothing survives underneath.
				const jpeg = await new Promise<Blob>((res, rej) => canvas.toBlob((bl) => bl ? res(bl) : rej(new Error("encode failed")), "image/jpeg", 0.85))
				const img = await out.embedJpg(await jpeg.arrayBuffer())
				const outPage = out.addPage([pts.width, pts.height])
				outPage.drawImage(img, { x: 0, y: 0, width: pts.width, height: pts.height })
				page.cleanup()
			}

			await worker.terminate()
			setState({ status: "running", message: "Building redacted PDF…", progress: 0.97 })
			const outBytes = await out.save()
			const blob = new Blob([outBytes.slice()], { type: "application/pdf" })
			setState({ status: "done", blob, filename: file.name.replace(/\.pdf$/i, "-redacted.pdf"), redactedCount, pageCount, matched: redactedCount > 0 })
		} catch (err) {
			setState({ status: "error", message: err instanceof Error ? `OCR redaction failed — ${err.message}` : "OCR redaction failed" })
		} finally {
			window.requestAnimationFrame = origRaf
		}
	}, [file, selected, custom, color])

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
			{/* Privacy assurance — the whole point of doing this client-side. */}
			<div className="alert rounded px-4 py-3" data-tone="warn" style={{ borderColor: "var(--border-strong)", background: "var(--surface)", color: "var(--foreground)" }}>
				<p className="text-xs leading-relaxed" style={{ color: "var(--ink-dim)" }}>
					<span className="font-medium" style={{ color: "var(--foreground)" }}>Runs entirely in your browser.</span> The scan is rendered, read, and rebuilt on this device — it is never uploaded. The redacted pages are flattened images, so the original pixels are destroyed, not just covered.
				</p>
			</div>

			{/* Upload */}
			<div className="flex flex-col gap-3">
				<p className="mono-label">01 — Upload a scanned PDF</p>
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
							<p className="text-sm" style={{ color: "var(--ink-dim)" }}>Drop a scanned PDF here, or <span className="underline underline-offset-2" style={{ color: "var(--foreground)" }}>browse</span></p>
							<p className="mono-label" style={{ color: "var(--ink-faint)" }}>Max 20 MB · stays on your device</p>
						</>
					)}
				</label>
			</div>

			{/* What to redact */}
			<div className="flex flex-col gap-3">
				<p className="mono-label">02 — What to redact</p>
				<div className="flex flex-wrap gap-2">
					{ENTITY_CHOICES.map((c) => (
						<button
							key={c.key}
							type="button"
							onClick={() => toggle(c.key)}
							className="text-xs px-3 py-1.5 rounded-full transition-opacity"
							style={selected.has(c.key)
								? { background: "var(--btn-bg)", color: "var(--btn-fg)", fontFamily: "var(--font-mono)" }
								: { border: "1px solid var(--border)", color: "var(--ink-dim)", fontFamily: "var(--font-mono)" }}
						>
							{c.label}
						</button>
					))}
				</div>
				<input
					type="text"
					value={custom}
					onChange={(e) => setCustom(e.target.value)}
					placeholder="Optional — a specific name or /regex/ to also redact"
					className="field rounded px-4 py-3 text-sm"
				/>
				<div className="flex items-center gap-3">
					<input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-9 h-9 rounded cursor-pointer p-0.5 bg-transparent" style={{ border: "1px solid var(--border)" }} />
					<span className="text-sm font-mono" style={{ color: "var(--ink-dim)" }}>{color} · box color</span>
				</div>
			</div>

			{/* Run */}
			<button
				type="button"
				onClick={run}
				disabled={!file || state.status === "running"}
				className="self-start rounded px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
				style={{ background: "var(--btn-bg)", color: "var(--btn-fg)", fontFamily: "var(--font-mono)" }}
			>
				{state.status === "running" ? "Working…" : "OCR & redact in browser"}
			</button>

			{state.status === "running" && (
				<div className="flex flex-col gap-2">
					<div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
						<div className="h-full rounded-full transition-all" style={{ width: `${Math.round(state.progress * 100)}%`, background: "var(--foreground)" }} />
					</div>
					<p className="text-xs" style={{ color: "var(--ink-dim)" }}>{state.message} <span style={{ color: "var(--ink-faint)" }}>· first run downloads the OCR model (~15 MB)</span></p>
				</div>
			)}

			{state.status === "error" && <div className="alert rounded px-4 py-3 text-sm">{state.message}</div>}

			{state.status === "done" && (
				<div className="panel rounded px-5 py-4 flex flex-col gap-3">
					{state.matched ? (
						<>
							<span className="text-xs font-medium" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em", color: "var(--verdict-pass)" }}>✓ Redacted &amp; flattened</span>
							<p className="text-sm">{state.redactedCount} match{state.redactedCount !== 1 ? "es" : ""} burned into {state.pageCount} page{state.pageCount !== 1 ? "s" : ""} of image — the original text is gone from the file.</p>
						</>
					) : (
						<>
							<span className="text-xs font-medium" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em", color: "var(--warn)" }}>◎ No matches found</span>
							<p className="text-sm" style={{ color: "var(--ink-dim)" }}>OCR read {state.pageCount} page{state.pageCount !== 1 ? "s" : ""} but nothing matched. The scan may be low-quality, or the data isn&apos;t in the selected types — try a custom pattern or a clearer scan. The output is flattened but unredacted.</p>
						</>
					)}
					<button type="button" onClick={download} className="self-start rounded px-4 py-2 text-sm transition-opacity hover:opacity-60" style={{ border: "1px solid var(--border)" }}>
						Download {state.matched ? "redacted" : "flattened"} PDF
					</button>
				</div>
			)}
		</div>
	)
}

// Parse a #rrggbb string to an rgb triple in the 0–1 range (default black).
function hexToRgb(hex: string): [number, number, number] {
	const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
	if (!m) return [0, 0, 0]
	const n = parseInt(m[1], 16)
	return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255]
}
