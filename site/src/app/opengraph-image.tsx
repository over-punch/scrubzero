// OG image for scrubzero — Redact mode (light). 1200×630.
import { ImageResponse } from "next/og"

export const alt = "scrubzero — Redact PDFs so nothing is recoverable"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

async function loadMerriweather(weight: number): Promise<ArrayBuffer> {
	const css = await fetch(
		`https://fonts.googleapis.com/css2?family=Merriweather:wght@${weight}`,
		{ headers: { "User-Agent": "Mozilla/4.0" } },
	).then((r) => r.text())
	const url = css.match(/src:\s*url\((https:[^)]+\.ttf)\)/)?.[1]
	if (!url) throw new Error("Merriweather TTF URL not found in Google Fonts CSS")
	return fetch(url).then((r) => r.arrayBuffer())
}

// A redaction bar with an exemption code at its right edge.
function Bar({ w, code }: { w: string; code: string }) {
	return (
		<div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", width: w, height: "26px", background: "#141414", padding: "0 12px" }}>
			<span style={{ fontSize: "13px", fontFamily: "monospace", color: "#f2ede3", opacity: 0.65 }}>{code}</span>
		</div>
	)
}

export default async function Image() {
	const font = await loadMerriweather(300)
	return new ImageResponse(
		(
			<div style={{ background: "#f2ede3", width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "68px 80px", justifyContent: "space-between", color: "#141414" }}>
				{/* Masthead */}
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #141414", paddingBottom: "16px" }}>
					<span style={{ fontSize: "22px", fontFamily: "monospace", fontWeight: 700, letterSpacing: "-0.01em" }}>scrubzero</span>
					<div style={{ display: "flex", alignItems: "center", border: "1.5px solid #2f6b45", borderRadius: "3px", padding: "6px 12px" }}>
						<div style={{ width: "9px", height: "9px", background: "#2f6b45", marginRight: "9px" }} />
						<span style={{ fontSize: "13px", fontFamily: "monospace", letterSpacing: "0.14em", color: "#2f6b45" }}>NO RECOVERABLE TEXT</span>
					</div>
				</div>

				{/* Hero */}
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "34px" }}>
						<Bar w="100%" code="(b)(6)" />
						<Bar w="74%" code="(b)(7)(C)" />
						<Bar w="88%" code="(b)(6)" />
					</div>
					<div style={{ display: "flex", flexDirection: "column", fontSize: "82px", fontFamily: "Merriweather", fontWeight: 300, lineHeight: "1.04" }}>
						<span>True PDF</span>
						<span style={{ fontStyle: "italic", opacity: 0.5 }}>redaction.</span>
					</div>
				</div>

				{/* Footer */}
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<span style={{ fontSize: "15px", fontFamily: "monospace", opacity: 0.5 }}>scrubzero.org</span>
					<span style={{ fontSize: "15px", fontFamily: "monospace", opacity: 0.35 }}>detect · redact · check</span>
				</div>
			</div>
		),
		{ ...size, fonts: [{ name: "Merriweather", data: font, weight: 300, style: "normal" }] },
	)
}
