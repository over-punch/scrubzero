// Credit ledger — Phase 1 uses the Stripe customer's metadata as the store, so
// there's NO extra database or paid dependency. A signed-in user is identified by
// email; that maps to one Stripe customer whose `scrubzero_credits` metadata holds
// the remaining balance. New customers get FREE_CREDITS to start.
//
// Caveat: Stripe metadata updates are not atomic, so two truly-concurrent scans by
// the same user could double-spend one credit. That's acceptable at MVP volume;
// graduate to a real store (Neon free tier) if/when concurrency matters.
import type Stripe from "stripe"
import { getStripe } from "./stripe"

const CREDIT_KEY = "scrubzero_credits"
/** Free credits granted to a brand-new customer. */
export const FREE_CREDITS = 500

function readBalance(customer: Stripe.Customer): number {
	const raw = customer.metadata?.[CREDIT_KEY]
	const n = raw ? parseInt(raw, 10) : NaN
	return Number.isFinite(n) ? n : 0
}

/** Find the Stripe customer for an email, creating one (with free credits) if absent. */
export async function getOrCreateCustomer(email: string): Promise<Stripe.Customer> {
	const stripe = getStripe()
	const existing = await stripe.customers.list({ email, limit: 1 })
	if (existing.data[0]) return existing.data[0]
	return stripe.customers.create({
		email,
		metadata: { [CREDIT_KEY]: String(FREE_CREDITS) },
	})
}

/** Current credit balance for a user (creates the customer + free grant on first read). */
export async function getCredits(email: string): Promise<number> {
	return readBalance(await getOrCreateCustomer(email))
}

/** Add credits to a customer (used by the Stripe webhook after a successful purchase). */
export async function addCredits(customerId: string, amount: number): Promise<number> {
	const stripe = getStripe()
	const customer = (await stripe.customers.retrieve(customerId)) as Stripe.Customer
	const next = readBalance(customer) + Math.max(0, Math.floor(amount))
	await stripe.customers.update(customerId, { metadata: { [CREDIT_KEY]: String(next) } })
	return next
}

/**
 * Try to consume `amount` credits for a user. Returns whether it succeeded and the
 * remaining balance. Used to gate + meter the hosted AI-detect tier.
 */
export async function tryConsumeCredits(
	email: string,
	amount = 1,
): Promise<{ ok: boolean; remaining: number }> {
	const customer = await getOrCreateCustomer(email)
	const balance = readBalance(customer)
	if (balance < amount) return { ok: false, remaining: balance }
	const remaining = balance - amount
	await getStripe().customers.update(customer.id, { metadata: { [CREDIT_KEY]: String(remaining) } })
	return { ok: true, remaining }
}
