"use client"
// Redaction-wipe transition between modes: an ink bar sweeps in to cover the
// screen, the theme + route flip underneath it, then it sweeps off to reveal
// the mirror. Provides useRedactTransition().go(href, mode, label).
import { createContext, useCallback, useContext, useRef, useState } from "react"
import { useRouter } from "next/navigation"

type Phase = "idle" | "in" | "out"
type Ctx = { go: (href: string, mode: "redact" | "check", label: string) => void; busy: boolean }

const TransitionCtx = createContext<Ctx | null>(null)
export function useRedactTransition() {
	return useContext(TransitionCtx)
}

export function RedactTransition({ children }: { children: React.ReactNode }) {
	const router = useRouter()
	const [phase, setPhase] = useState<Phase>("idle")
	const [label, setLabel] = useState("")
	const pending = useRef<{ href: string; mode: "redact" | "check" } | null>(null)

	const go = useCallback((href: string, mode: "redact" | "check", lbl: string) => {
		setPhase((p) => {
			if (p !== "idle") return p
			pending.current = { href, mode }
			setLabel(lbl)
			return "in"
		})
	}, [])

	const onEnd = useCallback(() => {
		setPhase((p) => {
			if (p === "in") {
				const next = pending.current
				if (next) {
					// Flip theme + route while the bar covers the screen.
					document.documentElement.dataset.mode = next.mode
					router.push(next.href)
				}
				return "out"
			}
			pending.current = null
			return "idle"
		})
	}, [router])

	return (
		<TransitionCtx.Provider value={{ go, busy: phase !== "idle" }}>
			{children}
			{phase !== "idle" && (
				<div className={`wipe wipe--${phase}`} onAnimationEnd={onEnd} aria-hidden="true">
					<span>{label}</span>
				</div>
			)}
		</TransitionCtx.Provider>
	)
}
