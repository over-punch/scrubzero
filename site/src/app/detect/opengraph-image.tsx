// OG image for scrubzero — Detect mode (light). 1200×630.
import { ImageResponse } from "next/og"

export const alt = "scrubzero Detect — find what needs redacting"
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

// A detected item — outlined (found, not yet redacted) with its type tag.
function Found({ text, tag }: { text: string; tag: string }) {
	return (
		<div style={{ display: "flex", alignItems: "center", height: "28px" }}>
			<div style={{ display: "flex", alignItems: "center", border: "1.5px dashed rgba(20,20,20,0.4)", borderRadius: "3px", height: "28px", padding: "0 12px", marginRight: "14px" }}>
				<span style={{ fontSize: "15px", fontFamily: "monospace", color: "#141414" }}>{text}</span>
			</div>
			<span style={{ fontSize: "12px", fontFamily: "monospace", letterSpacing: "0.1em", color: "#a02a1e" }}>{tag}</span>
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
					<span style={{ fontSize: "22px", fontFamily: "monospace", fontWeight: 700, letterSpacing: "-0.01em" }}>scrubzero <span style={{ opacity: 0.4 }}>/ detect</span></span>
					<div style={{ display: "flex", alignItems: "center", border: "1.5px solid rgba(20,20,20,0.5)", borderRadius: "3px", padding: "6px 12px" }}>
						<div style={{ width: "9px", height: "9px", border: "2px solid #141414", borderRadius: "9px", marginRight: "9px", opacity: 0.7 }} />
						<span style={{ fontSize: "13px", fontFamily: "monospace", letterSpacing: "0.14em", opacity: 0.7 }}>SCAN FIRST</span>
					</div>
				</div>

				{/* Hero */}
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "34px" }}>
						<Found text="jdoe@agency.gov" tag="EMAIL" />
						<Found text="551-23-9910" tag="SSN" />
						<Found text="John Q. Public" tag="AI · PERSON" />
					</div>
					<div style={{ display: "flex", flexDirection: "column", fontSize: "82px", fontFamily: "Merriweather", fontWeight: 300, lineHeight: "1.04" }}>
						<span>Find what</span>
						<span style={{ fontStyle: "italic", opacity: 0.5 }}>needs redacting.</span>
					</div>
				</div>

				{/* Footer */}
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<span style={{ fontSize: "15px", fontFamily: "monospace", opacity: 0.5 }}>scrubzero.org/detect</span>
					<span style={{ fontSize: "15px", fontFamily: "monospace", opacity: 0.35 }}>regex + AI · detect → redact → check</span>
				</div>
			</div>
		),
		{ ...size, fonts: [{ name: "Merriweather", data: font, weight: 300, style: "normal" }] },
	)
}
