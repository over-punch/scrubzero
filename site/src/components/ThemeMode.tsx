"use client"
// Sets the document theme mode (redact = light, check = dark) so soft-navigation
// between / and /check flips the palette. A blocking inline script in the check
// route prevents a flash on hard loads.
import { useEffect } from "react"

export function ThemeMode({ mode }: { mode: "redact" | "check" }) {
	useEffect(() => {
		document.documentElement.dataset.mode = mode
	}, [mode])
	return null
}
