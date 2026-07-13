// Account & billing — sign in, see your credit balance, buy more, manage billing.
// Server component: reads the session and the credit balance (from Stripe metadata).
import type { Metadata } from "next"
import { auth, signIn, signOut, authConfigured } from "@/auth"
import { stripeConfigured } from "@/lib/stripe"
import { getCredits } from "@/lib/credits"
import { ThemeMode } from "@/components/ThemeMode"
import { ModeToggle } from "@/components/ModeToggle"
import BillingButtons from "@/components/BillingButtons"

export const metadata: Metadata = { title: "scrubzero — Account", robots: { index: false } }

export default async function Account() {
	const session = await auth()
	const email = session?.user?.email ?? null

	let credits: number | null = null
	if (email && stripeConfigured) {
		try { credits = await getCredits(email) } catch { credits = null }
	}

	return (
		<main className="max-w-2xl mx-auto w-full px-6 py-16 flex flex-col">
			<ThemeMode mode="redact" />
			<header className="mb-14">
				<div className="flex items-center justify-between gap-4">
					<a href="/" style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "1.35rem", letterSpacing: "-0.01em" }}>scrubzero</a>
					<ModeToggle />
				</div>
				<div className="flex items-end justify-between gap-4 mt-3">
					<span className="mono-label">Account &amp; billing</span>
				</div>
				<div className="h-px mt-5" style={{ background: "var(--rule-strong)" }} />
			</header>

			{!authConfigured ? (
				<div className="alert rounded px-4 py-3 text-sm" data-tone="warn">
					Accounts aren&apos;t configured yet on this deployment. Set an OAuth provider (Google or GitHub) to enable sign-in.
				</div>
			) : !email ? (
				<section className="flex flex-col gap-5">
					<h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 6vw, 3rem)", letterSpacing: "-0.01em", lineHeight: 1.05 }}>
						Sign in.
					</h1>
					<p className="text-sm leading-relaxed" style={{ color: "var(--ink-dim)" }}>
						An account lets you run AI detection without pasting an API key — you get <strong style={{ color: "var(--foreground)" }}>500 free scans</strong>, then pay only for what you use. Everything else (redact, batch, OCR, verify) stays free and needs no account.
					</p>
					<form action={async () => { "use server"; await signIn(undefined, { redirectTo: "/account" }) }}>
						<button type="submit" className="rounded px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80" style={{ background: "var(--btn-bg)", color: "var(--btn-fg)", fontFamily: "var(--font-mono)" }}>
							Sign in to continue
						</button>
					</form>
				</section>
			) : (
				<section className="flex flex-col gap-8">
					<div className="flex items-center justify-between gap-4">
						<div className="flex flex-col gap-1">
							<span className="mono-label" style={{ color: "var(--ink-faint)" }}>Signed in as</span>
							<span className="text-sm font-medium">{email}</span>
						</div>
						<form action={async () => { "use server"; await signOut({ redirectTo: "/account" }) }}>
							<button type="submit" className="rounded px-4 py-2 text-xs transition-opacity opacity-70 hover:opacity-100" style={{ border: "1px solid var(--border)", fontFamily: "var(--font-mono)" }}>
								Sign out
							</button>
						</form>
					</div>

					<div className="panel rounded px-5 py-5 flex flex-col gap-2">
						<span className="mono-label" style={{ color: "var(--ink-faint)" }}>AI detection credits</span>
						{credits === null ? (
							<p className="text-sm" style={{ color: "var(--ink-dim)" }}>Billing isn&apos;t configured on this deployment yet.</p>
						) : (
							<>
								<span style={{ fontFamily: "var(--font-display)", fontSize: "2.5rem", lineHeight: 1 }}>{credits.toLocaleString()}</span>
								<span className="text-sm" style={{ color: "var(--ink-dim)" }}>scans remaining · 1 credit per AI detection scan</span>
							</>
						)}
					</div>

					<BillingButtons hasStripe={credits !== null} />
				</section>
			)}
		</main>
	)
}
