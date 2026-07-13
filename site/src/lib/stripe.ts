// Stripe SDK client (server-only), lazily constructed. The Stripe constructor
// throws when the key is missing, and Next.js evaluates route modules during
// `next build` — so we defer construction until first use (behind stripeConfigured
// guards) rather than at import time.
import Stripe from "stripe"

let _stripe: Stripe | null = null

/** Get the Stripe client, constructing it on first use. Throws if unconfigured. */
export function getStripe(): Stripe {
	if (!_stripe) {
		const key = process.env.STRIPE_SECRET_KEY
		if (!key) throw new Error("STRIPE_SECRET_KEY is not set")
		_stripe = new Stripe(key, { typescript: true })
	}
	return _stripe
}

/** True when a Stripe secret key is configured (gate paid features on this first). */
export const stripeConfigured = !!process.env.STRIPE_SECRET_KEY
