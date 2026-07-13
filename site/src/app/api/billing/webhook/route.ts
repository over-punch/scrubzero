// Stripe webhook — fulfils credit purchases. Verifies the signature, then on a
// completed checkout adds the purchased credits to the customer's balance. This is
// the ONLY place credits are granted from a payment (the client never grants them).
import { type NextRequest, NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"
import { addCredits } from "@/lib/credits"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
	const secret = process.env.STRIPE_WEBHOOK_SECRET
	const sig = req.headers.get("stripe-signature")
	if (!secret || !sig) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })

	// Signature verification requires the raw request body.
	const body = await req.text()
	let event
	try {
		event = getStripe().webhooks.constructEvent(body, sig, secret)
	} catch (err) {
		console.error("webhook signature verification failed:", err instanceof Error ? err.message : err)
		return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
	}

	if (event.type === "checkout.session.completed") {
		const session = event.data.object
		const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id
		const credits = parseInt(session.metadata?.credits ?? "0", 10) || 0
		if (customerId && credits > 0) {
			try {
				await addCredits(customerId, credits)
			} catch (err) {
				console.error("failed to grant credits:", err)
				// 500 so Stripe retries the webhook rather than dropping the fulfilment.
				return NextResponse.json({ error: "Fulfilment failed" }, { status: 500 })
			}
		}
	}

	return NextResponse.json({ received: true })
}
