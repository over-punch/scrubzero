// /api/detect — scan a PDF for content that *should* be redacted.
// Free tier: deterministic entity regexes from scrubzero.
// AI tier (bring-your-own-key): an LLM pass for the entities regex can't catch
// — person names, organisations, street addresses. The key is used for this one
// request and never stored or logged.
import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_BYTES = 4 * 1024 * 1024

interface Finding {
	type: string
	label: string
	count: number
	samples: string[]  // first few, for display
	values: string[]   // full de-duped list, for the redaction handoff
	pages: number[]
	tier: "regex" | "ai"
}

// Extract text per page using pdfjs (bottom-left coordinate space is irrelevant here).
async function extractPages(data: Uint8Array): Promise<string[]> {
	const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
	const copy = new Uint8Array(data) // pdfjs may neuter the source buffer
	const doc = await pdfjs.getDocument({ data: copy, useSystemFonts: true, isEvalSupported: false }).promise
	const pages: string[] = []
	for (let p = 1; p <= doc.numPages; p++) {
		const page = await doc.getPage(p)
		const content = await page.getTextContent()
		const text = content.items.map((i) => ("str" in i ? i.str : "")).join(" ")
		pages.push(text)
	}
	return pages
}

// AI pass: ask the caller's model for entities regex misses. Returns [] on any failure.
async function aiEntities(pages: string[], apiKey: string): Promise<Array<{ type: string; text: string; page: number }>> {
	const out: Array<{ type: string; text: string; page: number }> = []
	// Cap the work: first ~12 pages, ~6k chars each.
	const slice = pages.slice(0, 12)
	for (let i = 0; i < slice.length; i++) {
		const body = slice[i].slice(0, 6000).trim()
		if (body.length < 3) continue
		try {
			const res = await fetch("https://api.anthropic.com/v1/messages", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-api-key": apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model: "claude-haiku-4-5-20251001",
					max_tokens: 1024,
					system:
						"You extract sensitive entities from document text for redaction review. Return ONLY a compact JSON array of {\"type\":\"person\"|\"org\"|\"address\",\"text\":string}. Include person names, organisation names, and street/mailing addresses. Do NOT include emails, phone numbers, SSNs, dates, or IP addresses (handled elsewhere). No prose, no markdown fences.",
					messages: [{ role: "user", content: body }],
				}),
			})
			if (!res.ok) continue
			const json = (await res.json()) as { content?: Array<{ text?: string }> }
			const raw = json.content?.[0]?.text ?? "[]"
			const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")) as Array<{ type: string; text: string }>
			for (const e of parsed) {
				if (e?.text && e.text.length > 1) out.push({ type: e.type || "entity", text: e.text.trim(), page: i + 1 })
			}
		} catch {
			// ignore this page — AI tier is best-effort
		}
	}
	return out
}

export async function POST(req: NextRequest) {
	try {
		const form = await req.formData()
		const file = form.get("pdf")
		if (!(file instanceof File)) return NextResponse.json({ error: "No PDF provided" }, { status: 400 })
		if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large — maximum is 4 MB" }, { status: 413 })

		let opts: { ai?: boolean; apiKey?: string } = {}
		try { opts = JSON.parse((form.get("options") as string) || "{}") } catch { /* defaults */ }

		const data = new Uint8Array(await file.arrayBuffer())
		const pages = await extractPages(data)

		// A scan has no extractable text, so regex/AI detection can't see its
		// contents. Flag it so the UI can warn rather than reporting "0 findings".
		const textChars = pages.join("").replace(/\s/g, "").length
		const scanned = textChars < 24

		const { EntityPatterns } = await import("scrubzero")
		const findings: Finding[] = []

		// ── Regex tier ──────────────────────────────────────────────
		for (const [type, def] of Object.entries(EntityPatterns) as Array<[string, { pattern: RegExp; label?: string }]>) {
			const seen = new Set<string>()
			const samples: string[] = []
			const pageSet = new Set<number>()
			pages.forEach((text, pi) => {
				const re = new RegExp(def.pattern.source, def.pattern.flags.includes("g") ? def.pattern.flags : def.pattern.flags + "g")
				let m: RegExpExecArray | null
				while ((m = re.exec(text)) !== null) {
					const val = m[0].trim()
					if (!val) continue
					pageSet.add(pi + 1)
					if (!seen.has(val)) { seen.add(val); if (samples.length < 4) samples.push(val) }
				}
			})
			if (seen.size > 0) {
				findings.push({ type, label: def.label ?? type, count: seen.size, samples, values: [...seen].slice(0, 100), pages: [...pageSet].sort((a, b) => a - b), tier: "regex" })
			}
		}

		// ── AI tier (BYOK) ──────────────────────────────────────────
		let aiUsed = false
		if (opts.ai && opts.apiKey) {
			aiUsed = true
			const ai = await aiEntities(pages, opts.apiKey)
			const byType = new Map<string, { samples: string[]; seen: Set<string>; pages: Set<number> }>()
			for (const e of ai) {
				const key = e.type
				if (!byType.has(key)) byType.set(key, { samples: [], seen: new Set(), pages: new Set() })
				const b = byType.get(key)!
				b.pages.add(e.page)
				if (!b.seen.has(e.text)) { b.seen.add(e.text); if (b.samples.length < 4) b.samples.push(e.text) }
			}
			const LABELS: Record<string, string> = { person: "Person name", org: "Organisation", address: "Address" }
			for (const [type, b] of byType) {
				findings.push({ type: `ai-${type}`, label: LABELS[type] ?? type, count: b.seen.size, samples: b.samples, values: [...b.seen].slice(0, 100), pages: [...b.pages].sort((a, b2) => a - b2), tier: "ai" })
			}
		}

		return NextResponse.json({
			findings,
			pageCount: pages.length,
			aiUsed,
			scanned,
			total: findings.reduce((s, f) => s + f.count, 0),
		})
	} catch (err) {
		return NextResponse.json({ error: err instanceof Error ? err.message : "Detection failed" }, { status: 500 })
	}
}
