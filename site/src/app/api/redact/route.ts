// API route — receives a PDF and a search pattern, returns a redacted PDF as base64.
import { type NextRequest } from "next/server"

const MAX_BYTES = 4 * 1024 * 1024 // 4 MB

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
	const color = formData.get("color") // optional hex color like "#000000"

	if (!(file instanceof File)) {
		return Response.json({ error: "No PDF file provided" }, { status: 400 })
	}
	const hasPattern = typeof pattern === "string" && pattern.trim() !== ""
	const hasStrings = typeof strings === "string" && strings.trim() !== ""
	if (!hasPattern && !hasStrings) {
		return Response.json({ error: "No search pattern provided" }, { status: 400 })
	}
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
		const { searchAndRedact } = await import("@liiift-studio/pdf-redact")
		const buffer = await file.arrayBuffer()

		// Build the pattern list — either literal strings (Detect handoff) or a single search pattern.
		type Pat = { pattern: RegExp | string; color?: [number, number, number]; label: string }
		let patterns: Pat[]
		if (hasStrings) {
			let list: string[] = []
			try { list = JSON.parse(strings as string) } catch { return Response.json({ error: "Invalid strings payload" }, { status: 400 }) }
			list = [...new Set(list.filter((s) => typeof s === "string" && s.trim().length > 0))].slice(0, 500)
			if (list.length === 0) return Response.json({ error: "No values selected to redact" }, { status: 400 })
			const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
			patterns = list.map((s) => ({ pattern: new RegExp(esc(s), "g"), color: redactionColor, label: "REDACTED" }))
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
			patterns = [{ pattern: searchPattern, color: redactionColor, label: "REDACTED" }]
		}

		const result = await searchAndRedact(buffer, patterns)

		// Encode the resulting PDF as base64 for transfer.
		const base64 = Buffer.from(result.pdf).toString("base64")
		return Response.json({
			pdf: base64,
			redactedCount: result.redactedCount,
			pagesAffected: result.pagesAffected,
		})
	} catch (err) {
		console.error("pdf-redact error:", err)
		return Response.json({ error: "Redaction failed — the PDF may be malformed or encrypted" }, { status: 500 })
	}
}
