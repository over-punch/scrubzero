// API route — receives a PDF and a search pattern, returns a redacted PDF as base64.
// The uploaded PDF is held in memory only for the length of this request and is
// never written to disk or persisted; nothing is retained after the response.
import { type NextRequest } from "next/server"

export const runtime = "nodejs"

const MAX_BYTES = 4 * 1024 * 1024 // 4 MB

// Roughly how much extractable text a PDF must have before we stop treating it
// as a scanned/image document. Pattern and entity redaction operate on the text
// layer, so a scanned page yields nothing to remove — the user must be told.
const MIN_TEXT_CHARS = 24

/**
 * Return the total number of non-whitespace characters extractable from the PDF.
 * A near-zero count means the content is a raster image (a scan), not text.
 */
async function extractableTextLength(data: Uint8Array): Promise<number> {
	try {
		const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
		const doc = await pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true, isEvalSupported: false }).promise
		let chars = 0
		for (let p = 1; p <= doc.numPages; p++) {
			const page = await doc.getPage(p)
			const content = await page.getTextContent()
			for (const i of content.items) chars += ("str" in i ? i.str.replace(/\s/g, "").length : 0)
			page.cleanup()
		}
		await doc.destroy()
		return chars
	} catch {
		return -1 // unknown — don't assert "scanned" if parsing failed
	}
}

export async function POST(req: NextRequest) {
	let formData: FormData
	try {
		formData = await req.formData()
	} catch {
		return Response.json({ error: "Invalid request" }, { status: 400 })
	}

	const file = formData.get("pdf")
	const pattern = formData.get("pattern")
	const strings = formData.get("strings") // optional JSON array of literal strings (Detect → Redact handoff)
	const groups = formData.get("groups")   // optional JSON [{ code, label, values[] }] (per-code Detect handoff)
	const color = formData.get("color")     // optional hex color like "#000000"
	const exemptionCode = formData.get("exemptionCode") // optional FOIA code applied to all matches
	const redactorId = formData.get("redactorId")       // optional operator ID for the audit log

	if (!(file instanceof File)) {
		return Response.json({ error: "No PDF file provided" }, { status: 400 })
	}
	const hasPattern = typeof pattern === "string" && pattern.trim() !== ""
	const hasStrings = typeof strings === "string" && strings.trim() !== ""
	const hasGroups = typeof groups === "string" && groups.trim() !== ""
	if (!hasPattern && !hasStrings && !hasGroups) {
		return Response.json({ error: "No search pattern provided" }, { status: 400 })
	}
	const code = typeof exemptionCode === "string" && exemptionCode.trim() !== "" ? exemptionCode.trim() : undefined
	const operator = typeof redactorId === "string" && redactorId.trim() !== "" ? redactorId.trim() : undefined
	if (file.size > MAX_BYTES) {
		return Response.json({ error: "File too large — maximum is 4 MB" }, { status: 413 })
	}

	// Parse the hex color into an rgb triple [0–1] if provided.
	let redactionColor: [number, number, number] | undefined
	if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) {
		const r = parseInt(color.slice(1, 3), 16) / 255
		const g = parseInt(color.slice(3, 5), 16) / 255
		const b = parseInt(color.slice(5, 7), 16) / 255
		redactionColor = [r, g, b]
	}

	try {
		const { searchAndRedact, verify } = await import("@liiift-studio/pdf-redact")
		const buffer = await file.arrayBuffer()

		// Build the pattern list. Three input shapes:
		//  - groups:  [{ code, label, values[] }]  — Detect handoff with per-code exemptions
		//  - strings: ["value", …]                 — flat Detect handoff (single code, if any)
		//  - pattern: "text" or "/regex/flags"     — manual sandbox
		type Pat = { pattern: RegExp | string; color?: [number, number, number]; label: string; exemptionCode?: string }
		const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
		let patterns: Pat[]
		if (hasGroups) {
			let parsed: Array<{ code?: string; label?: string; values?: string[] }> = []
			try { parsed = JSON.parse(groups as string) } catch { return Response.json({ error: "Invalid groups payload" }, { status: 400 }) }
			patterns = []
			for (const grp of parsed) {
				const vals = [...new Set((grp.values ?? []).filter((s) => typeof s === "string" && s.trim().length > 0))].slice(0, 500)
				for (const s of vals) {
					patterns.push({ pattern: new RegExp(esc(s), "g"), color: redactionColor, label: grp.label ?? grp.code ?? "REDACTED", ...(grp.code ? { exemptionCode: grp.code } : {}) })
				}
			}
			patterns = patterns.slice(0, 1000)
			if (patterns.length === 0) return Response.json({ error: "No values selected to redact" }, { status: 400 })
		} else if (hasStrings) {
			let list: string[] = []
			try { list = JSON.parse(strings as string) } catch { return Response.json({ error: "Invalid strings payload" }, { status: 400 }) }
			list = [...new Set(list.filter((s) => typeof s === "string" && s.trim().length > 0))].slice(0, 500)
			if (list.length === 0) return Response.json({ error: "No values selected to redact" }, { status: 400 })
			patterns = list.map((s) => ({ pattern: new RegExp(esc(s), "g"), color: redactionColor, label: code ?? "REDACTED", ...(code ? { exemptionCode: code } : {}) }))
		} else {
			let searchPattern: RegExp | string = (pattern as string).trim()
			// Wrap in regex if the user enclosed the pattern in forward slashes.
			const rxMatch = searchPattern.match(/^\/(.+)\/([gimsuy]*)$/)
			if (rxMatch) {
				try {
					searchPattern = new RegExp(rxMatch[1]!, rxMatch[2])
				} catch {
					return Response.json({ error: "Invalid regular expression" }, { status: 400 })
				}
			}
			patterns = [{ pattern: searchPattern, color: redactionColor, label: code ?? "REDACTED", ...(code ? { exemptionCode: code } : {}) }]
		}

		// Generate the audit manifest (redaction log) whenever an exemption code or
		// redactor ID is supplied, or any pattern carries a code. Stamp the code on
		// the bar in those cases too.
		const anyCode = !!code || patterns.some((p) => p.exemptionCode)
		const wantManifest = anyCode || !!operator

		// Flag scanned/image PDFs: text-based redaction cannot touch image pixels,
		// so a near-empty text layer means the bar only covers, never removes.
		const textLen = await extractableTextLength(new Uint8Array(buffer))
		const scanned = textLen >= 0 && textLen < MIN_TEXT_CHARS

		const result = await searchAndRedact(buffer, patterns, {
			generateManifest: wantManifest,
			addRedactionMarkers: anyCode,
			...(operator ? { redactorId: operator } : {}),
		})

		// Surface any library-level cautions (e.g. bars over image/vector content).
		// Read defensively so the site builds against either the current or the
		// warnings-aware (>= 0.2.0) release of @liiift-studio/pdf-redact.
		const libWarnings = (result as { warnings?: Array<{ message: string }> }).warnings ?? []
		const warnings = libWarnings.map((w) => w.message)
		if (scanned) {
			warnings.unshift(
				"This PDF has little or no extractable text — it looks like a scan or image. Text and pattern redaction only remove the text layer, so nothing was removed from the image itself. The bar covers it on screen but the original pixels remain recoverable. Use the “Scanned PDFs” tool below to OCR and truly redact it in your browser.",
			)
		}

		// Prove the negative: re-run the verifier against our OWN output and report
		// what it finds. A green result on the site is now this check passing, not
		// an assertion — text recovered under a bar means the scrub missed, and
		// verify warnings mean the output isn't verifiably clean (e.g. a scan).
		let verified: { clean: boolean; violations: number; recovered: string[]; warnings: string[] } | null = null
		try {
			const outAb = result.pdf.slice().buffer as ArrayBuffer
			const v = await verify(outAb)
			const vWarnings = (v as { warnings?: Array<{ message: string }> }).warnings ?? []
			verified = {
				clean: v.clean,
				violations: v.violations.length,
				recovered: v.violations.slice(0, 5).map((x) => x.recoveredText),
				warnings: vWarnings.map((w) => w.message),
			}
		} catch {
			verified = null // verification is best-effort; never block returning the PDF
		}

		// Encode the resulting PDF as base64 for transfer.
		const base64 = Buffer.from(result.pdf).toString("base64")
		return Response.json({
			pdf: base64,
			redactedCount: result.redactedCount,
			pagesAffected: result.pagesAffected,
			scanned,
			warnings,
			verified,
			// The exportable redaction log — present when an exemption code or
			// redactor ID was supplied. The client offers it as a JSON download.
			manifest: (result as { manifest?: unknown }).manifest ?? null,
		})
	} catch (err) {
		console.error("pdf-redact error:", err)
		return Response.json({ error: "Redaction failed — the PDF may be malformed or encrypted" }, { status: 500 })
	}
}
