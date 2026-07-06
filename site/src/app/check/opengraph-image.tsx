// OG image for scrubzero — Check mode (dark). 1200×630.
import { ImageResponse } from "next/og"

export const alt = "scrubzero Check — is your PDF actually redacted?"
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

// A retracted bar (stub with code) exposing the recovered text beside it.
function Reveal({ text, code }: { text: string; code: string }) {
	return (
		<div style={{ display: "flex", alignItems: "center", height: "26px" }}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", width: "70px", height: "26px", background: "#ece6d8", padding: "0 8px", marginRight: "14px" }}>
				<span style={{ fontSize: "12px", fontFamily: "monospace", color: "#0d0d0f", opacity: 0.7 }}>{code}</span>
			</div>
			<span style={{ fontSize: "16px", fontFamily: "monospace", color: "#ece6d8" }}>{text}</span>
		</div>
	)
}

export default async function Image() {
	const font = await loadMerriweather(300)
	return new ImageResponse(
		(
			<div style={{ background: "#0d0d0f", width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "68px 80px", justifyContent: "space-between", color: "#ece6d8" }}>
				{/* Masthead */}
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid rgba(236,230,216,0.6)", paddingBottom: "16px" }}>
					<span style={{ fontSize: "22px", fontFamily: "monospace", fontWeight: 700, letterSpacing: "-0.01em" }}>scrubzero <span style={{ opacity: 0.4 }}>/ check</span></span>
					<div style={{ display: "flex", alignItems: "center", border: "1.5px solid #e0564a", borderRadius: "3px", padding: "6px 12px" }}>
						<div style={{ width: "9px", height: "9px", background: "#e0564a", marginRight: "9px" }} />
						<span style={{ fontSize: "13px", fontFamily: "monospace", letterSpacing: "0.14em", color: "#e0564a" }}>RECOVERABLE</span>
					</div>
				</div>

				{/* Hero */}
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "34px" }}>
						<Reveal text="jdoe@agency.gov" code="(b)(6)" />
						<Reveal text="Case 1:24-cr-00318" code="(b)(7)(C)" />
					</div>
					<div style={{ display: "flex", flexDirection: "column", fontSize: "82px", fontFamily: "Merriweather", fontWeight: 300, lineHeight: "1.04" }}>
						<span>Is it actually</span>
						<span style={{ fontStyle: "italic", opacity: 0.5 }}>redacted?</span>
					</div>
				</div>

				{/* Footer */}
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<span style={{ fontSize: "15px", fontFamily: "monospace", opacity: 0.5 }}>scrubzero.org/check</span>
					<span style={{ fontSize: "15px", fontFamily: "monospace", opacity: 0.35 }}>reveal what a fake bar failed to hide</span>
				</div>
			</div>
		),
		{ ...size, fonts: [{ name: "Merriweather", data: font, weight: 300, style: "normal" }] },
	)
}
