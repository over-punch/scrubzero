// OG image for scrubzero — 1200×630, legal/classified theme.
import { ImageResponse } from "next/og"

export const alt = "scrubzero — True PDF content-stream redaction"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// Satori (next/og) cannot parse WOFF2; the in-repo Merriweather is WOFF2-only.
// Google Fonts serves static TTF (which Satori supports) to legacy user agents.
async function loadMerriweather(weight: number): Promise<ArrayBuffer> {
	const css = await fetch(
		`https://fonts.googleapis.com/css2?family=Merriweather:wght@${weight}`,
		{ headers: { "User-Agent": "Mozilla/4.0" } },
	).then((r) => r.text())
	const url = css.match(/src:\s*url\((https:[^)]+\.ttf)\)/)?.[1]
	if (!url) throw new Error("Merriweather TTF URL not found in Google Fonts CSS")
	return fetch(url).then((r) => r.arrayBuffer())
}

export default async function Image() {
	const font = await loadMerriweather(300)

	return new ImageResponse(
		(
			<div
				style={{
					background: "#f2ede3",
					width: "100%",
					height: "100%",
					display: "flex",
					flexDirection: "column",
					padding: "72px 80px",
					justifyContent: "space-between",
					color: "#111111",
				}}
			>
				{/* Masthead */}
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #111111", paddingBottom: "16px" }}>
					<span style={{ fontSize: "13px", letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "sans-serif" }}>
						SCRUBZERO
					</span>
					<span style={{ fontSize: "13px", opacity: 0.4, fontFamily: "monospace" }}>scrubzero.org</span>
				</div>

				{/* Hero */}
				<div style={{ display: "flex", flexDirection: "column", gap: "0px" }}>
					{/* Redaction bar motif */}
					<div style={{ height: "22px", background: "#111111", width: "100%", marginBottom: "32px" }} />
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							fontSize: "86px",
							fontFamily: "Merriweather",
							fontWeight: 300,
							lineHeight: "1.05",
						}}
					>
						<span>True PDF</span>
						<span style={{ fontStyle: "italic", opacity: 0.5 }}>redaction.</span>
					</div>
					<p style={{ fontSize: "21px", opacity: 0.5, margin: "28px 0 0", lineHeight: "1.5", fontFamily: "sans-serif" }}>
						Removes text from content streams before drawing the bar.
						No hidden layers. No recoverable text. Node.js and Lambda.
					</p>
				</div>

				{/* Footer */}
				<div style={{ display: "flex", justifyContent: "flex-end" }}>
					<span style={{ fontSize: "14px", opacity: 0.35, fontFamily: "monospace" }}>npm install @liiift-studio/pdf-redact</span>
				</div>
			</div>
		),
		{
			...size,
			fonts: [{ name: "Merriweather", data: font, weight: 300, style: "normal" }],
		},
	)
}
