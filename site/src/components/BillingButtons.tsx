"use client"
// Buy-credits and manage-billing buttons. Each POSTs to a billing route that mints
// a Stripe-hosted URL, then redirects there — no payment data touches this app.
import { useState } from "react"

export default function BillingButtons({ hasStripe }: { hasStripe: boolean }) {
	const [busy, setBusy] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	const go = async (path: string, label: string) => {
		setBusy(label); setError(null)
		try {
			const res = await fetch(path, { method: "POST" })
			const data = await res.json() as { url?: string; error?: string }
			if (data.url) { window.location.href = data.url; return }
			setError(data.error ?? "Something went wrong")
		} catch {
			setError("Network error — please try again")
		}
		setBusy(null)
	}

	if (!hasStripe) return null

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap gap-3">
				<button
					type="button"
					disabled={busy !== null}
					onClick={() => go("/api/billing/checkout", "buy")}
					className="rounded px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
					style={{ background: "var(--btn-bg)", color: "var(--btn-fg)", fontFamily: "var(--font-mono)" }}
				>
					{busy === "buy" ? "Opening checkout…" : "Buy credits"}
				</button>
				<button
					type="button"
					disabled={busy !== null}
					onClick={() => go("/api/billing/portal", "portal")}
					className="rounded px-4 py-2.5 text-sm transition-opacity opacity-80 hover:opacity-100 disabled:opacity-40"
					style={{ border: "1px solid var(--border)", fontFamily: "var(--font-mono)" }}
				>
					{busy === "portal" ? "Opening…" : "Manage billing"}
				</button>
			</div>
			<p className="mono-label" style={{ color: "var(--ink-faint)" }}>Payment is handled by Stripe. Your card details never touch scrubzero.</p>
			{error && <div className="alert rounded px-4 py-2 text-xs">{error}</div>}
		</div>
	)
}
