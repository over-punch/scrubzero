// Open the Stripe Customer Portal for the signed-in user (payment history, receipts,
// managing payment methods). Stripe hosts the whole portal — we just mint the link.
import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getStripe, stripeConfigured } from "@/lib/stripe"
import { getOrCreateCustomer } from "@/lib/credits"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
	if (!stripeConfigured) return NextResponse.json({ error: "Billing is not configured" }, { status: 503 })
	const session = await auth()
	const email = session?.user?.email
	if (!email) return NextResponse.json({ error: "Sign in first" }, { status: 401 })

	try {
		const customer = await getOrCreateCustomer(email)
		const origin = req.headers.get("origin") ?? "https://scrubzero.org"
		const portal = await getStripe().billingPortal.sessions.create({
			customer: customer.id,
			return_url: `${origin}/account`,
		})
		return NextResponse.json({ url: portal.url })
	} catch (err) {
		console.error("portal error:", err)
		return NextResponse.json({ error: "Could not open the billing portal" }, { status: 500 })
	}
}
