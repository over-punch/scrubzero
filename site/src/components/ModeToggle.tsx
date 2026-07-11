"use client"
// Intent-based pipeline rail: 1 Find → 2 Redact → 3 Verify. The labels describe
// what the user wants to do (not the internal mode name), and the numbers make
// the Detect → Redact → Check order legible from anywhere. URLs are unchanged
// (/detect, /, /check) so existing links and the unseal redirect keep working.
// Clicking triggers the theme-flip wipe (falls back to a normal link if JS is off).
import { usePathname } from "next/navigation"
import { useRedactTransition } from "./RedactTransition"

const TABS: Array<{ n: string; href: string; label: string; title: string; mode: "redact" | "check" }> = [
	{ n: "1", href: "/detect", label: "Find", title: "Find what to hide", mode: "redact" },
	{ n: "2", href: "/", label: "Redact", title: "Redact my file", mode: "redact" },
	{ n: "3", href: "/check", label: "Verify", title: "Verify a file I received", mode: "check" },
]

export function ModeToggle() {
	const path = usePathname()
	const active = path.startsWith("/check") ? "/check" : path.startsWith("/detect") ? "/detect" : "/"
	const t = useRedactTransition()

	return (
		<nav className="modetoggle" aria-label="Pipeline: find, redact, verify">
			{TABS.map(({ n, href, label, title, mode }) => {
				const isActive = active === href
				return (
					<a
						key={href}
						href={href}
						title={title}
						aria-current={isActive ? "page" : undefined}
						data-active={isActive}
						onClick={(e) => {
							if (isActive || !t) return
							e.preventDefault()
							t.go(href, mode, label)
						}}
					>
						<span className="modetoggle__n">{n}</span>
						{label}
					</a>
				)
			})}
		</nav>
	)
}
