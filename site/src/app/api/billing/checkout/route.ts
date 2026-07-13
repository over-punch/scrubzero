// Create a Stripe Checkout Session for a one-time credit-pack purchase. Requires a
// signed-in user; the credits granted come from the Price's `credits` metadata,
// stamped onto the session so the webhook can fulfil it. No money is handled here —
// Stripe's hosted Checkout page collects payment.
import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getStripe, stripeConfigured } from "@/lib/stripe"
import { getOrCreateCustomer } from "@/lib/credits"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
	if (!stripeConfigured || !process.env.STRIPE_PRICE_ID) {
		return NextResponse.json({ error: "Billing is not configured" }, { status: 503 })
	}
	const session = await auth()
	const email = session?.user?.email
	if (!email) return NextResponse.json({ error: "Sign in to buy credits" }, { status: 401 })

	try {
		const customer = await getOrCreateCustomer(email)
		const priceId = process.env.STRIPE_PRICE_ID
		// Read how many credits this price grants (set on the Price metadata) so the
		// webhook can fulfil exactly what was bought.
		const price = await getStripe().prices.retrieve(priceId)
		const credits = price.metadata?.credits ?? "0"

		const origin = req.headers.get("origin") ?? "https://scrubzero.org"
		const checkout = await getStripe().checkout.sessions.create({
			mode: "payment",
			customer: customer.id,
			line_items: [{ price: priceId, quantity: 1 }],
			metadata: { credits, email },
			success_url: `${origin}/account?purchase=success`,
			cancel_url: `${origin}/account?purchase=cancelled`,
			allow_promotion_codes: true,
		})
		return NextResponse.json({ url: checkout.url })
	} catch (err) {
		console.error("checkout error:", err)
		return NextResponse.json({ error: "Could not start checkout" }, { status: 500 })
	}
}
