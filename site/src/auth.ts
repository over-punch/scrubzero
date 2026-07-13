// Auth.js (NextAuth v5) — free, self-hosted auth for the scrubzero paid tier.
// No third-party auth service, no per-user cost. Stateless JWT sessions (no DB).
// Providers are enabled only when their env credentials are present, so the app
// runs fine with whichever OAuth app you configure (Google and/or GitHub).
import NextAuth, { type NextAuthConfig } from "next-auth"
import GitHub from "next-auth/providers/github"
import Google from "next-auth/providers/google"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const providers: NextAuthConfig["providers"] = []
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) providers.push(Google)
if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) providers.push(GitHub)

/** True when at least one OAuth provider is configured (used to hide sign-in UI otherwise). */
export const authConfigured = providers.length > 0

export const { auth, handlers, signIn, signOut } = NextAuth({
	providers,
	// Stateless JWT sessions — no database. The user's email is the identity we
	// map to a Stripe customer at runtime (see lib/credits.ts).
	session: { strategy: "jwt" },
	callbacks: {
		// Keep the email on the token/session so server code can find the customer.
		async jwt({ token, user }) {
			if (user?.email) token.email = user.email
			return token
		},
		async session({ session, token }) {
			if (session.user && token.email) session.user.email = token.email as string
			return session
		},
	},
})
