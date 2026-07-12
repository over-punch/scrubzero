// Core audit() implementation — orchestrates all enabled checks and returns an AuditReport.

import { createHash } from 'crypto';
import type { AuditOptions, AuditReport, AuditFinding } from './types.js';
import { checkTextUnderBox } from './checks/text-under-box.js';
import { checkIncrementalSave } from './checks/incremental-save.js';
import { checkMetadataLeak } from './checks/metadata-leak.js';
import { checkPendingAnnotation } from './checks/pending-annotation.js';
import { checkGlyphPosition } from './checks/glyph-position.js';

/** Default options applied when the caller does not specify a value. */
const DEFAULTS: Required<AuditOptions> = {
	textUnderBox: true,
	incrementalSave: true,
	metadataLeak: true,
	pendingAnnotation: true,
	glyphPositionLeak: false,
	patternOracle: false,
};

/**
 * Audits the given PDF for fake or insecure redactions.
 * Returns an AuditReport describing all findings.
 *
 * @param pdf - The PDF file as an ArrayBuffer.
 * @param options - Which checks to enable. Defaults to all Tier 1 checks.
 */
export async function audit(pdf: ArrayBuffer, options: AuditOptions = {}): Promise<AuditReport> {
	const opts = { ...DEFAULTS, ...options };

	const pdfBytes = new Uint8Array(pdf);
	const sha256 = createHash('sha256').update(pdfBytes).digest('hex');

	const allFindings: AuditFinding[] = [];

	// Tier 1 checks — fast, run in parallel where possible.
	const tier1Promises: Promise<AuditFinding[]>[] = [];

	if (opts.incrementalSave) {
		// Synchronous — resolve immediately.
		const findings = checkIncrementalSave(pdfBytes);
		allFindings.push(...findings);
	}

	if (opts.metadataLeak) {
		tier1Promises.push(checkMetadataLeak(pdf));
	}

	// Page-level checks require knowing the page count.
	let numPages = 0;

	if (opts.textUnderBox || opts.pendingAnnotation || opts.glyphPositionLeak) {
		const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
		const probe = await getDocument({ data: pdf.slice(0) }).promise;
		numPages = probe.numPages;
		await probe.destroy();
	}

	// Collect per-page checks.
	const pageCheckPromises: Promise<AuditFinding[]>[] = [...tier1Promises];

	for (let p = 1; p <= numPages; p++) {
		if (opts.textUnderBox) {
			pageCheckPromises.push(checkTextUnderBox(pdf, p));
		}
		if (opts.pendingAnnotation) {
			pageCheckPromises.push(checkPendingAnnotation(pdf, p));
		}
		// Tier 2: real Bland et al. glyph-position check using font metrics.
		if (opts.glyphPositionLeak) {
			pageCheckPromises.push(checkGlyphPosition(pdf, p));
		}
	}

	if (tier1Promises.length > 0 && numPages === 0) {
		// metadataLeak only, no page checks — run and collect.
		const results = await Promise.all(tier1Promises);
		for (const r of results) allFindings.push(...r);
	} else if (pageCheckPromises.length > 0) {
		const results = await Promise.all(pageCheckPromises);
		for (const r of results) allFindings.push(...r);
	}

	// Tier 3 (LLM pattern oracle) is not bundled in scrubzero — the deterministic
	// checks above are the audit. `opts.patternOracle` is accepted but a no-op.

	// Deduplicate findings by check+page+bbox key.
	const seen = new Set<string>();
	const dedupedFindings: AuditFinding[] = [];
	for (const f of allFindings) {
		const key = `${f.check}|${f.page ?? ''}|${f.bbox?.join(',') ?? ''}|${f.detail.slice(0, 60)}`;
		if (!seen.has(key)) {
			seen.add(key);
			dedupedFindings.push(f);
		}
	}

	return {
		clean: dedupedFindings.length === 0,
		findings: dedupedFindings,
		checkedAt: new Date().toISOString(),
		sha256,
	};
}

