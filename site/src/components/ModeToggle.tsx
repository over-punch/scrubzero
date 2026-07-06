"use client"
// Segmented Detect | Redact | Check control. Clicking triggers the redaction-wipe
// transition (falls back to a normal link if JS/transition is unavailable).
// Detect and Redact share the light theme; Check is the dark mirror.
import { usePathname } from "next/navigation"
import { useRedactTransition } from "./RedactTransition"

const TABS: Array<{ href: string; label: string; mode: "redact" | "check" }> = [
	{ href: "/detect", label: "Detect", mode: "redact" },
	{ href: "/", label: "Redact", mode: "redact" },
	{ href: "/check", label: "Check", mode: "check" },
]

export function ModeToggle() {
	const path = usePathname()
	const active = path.startsWith("/check") ? "/check" : path.startsWith("/detect") ? "/detect" : "/"
	const t = useRedactTransition()

	return (
		<div className="modetoggle" role="tablist" aria-label="Mode">
			{TABS.map(({ href, label, mode }) => {
				const isActive = active === href
				return (
					<a
						key={href}
						href={href}
						role="tab"
						aria-selected={isActive}
						data-active={isActive}
						onClick={(e) => {
							if (isActive || !t) return
							e.preventDefault()
							t.go(href, mode, label)
						}}
					>
						{label}
					</a>
				)
			})}
		</div>
	)
}
