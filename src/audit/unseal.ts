// Core unseal() implementation — orchestrates all recovery scenarios and returns an UnsealResult.

/** Copies a Uint8Array into a new Uint8Array backed by a plain ArrayBuffer. */
function toPlainUint8Array(src: Uint8Array): Uint8Array {
	const buf = new ArrayBuffer(src.byteLength);
	new Uint8Array(buf).set(src);
	return new Uint8Array(buf);
}

import type { UnsealOptions, UnsealResult } from './types.js';
import { audit } from './audit.js';
import { stripOverlays } from './recovery/strip-overlays.js';
import { stripAnnotations } from './recovery/strip-annotations.js';
import { extractPriorRevision } from './recovery/extract-revision.js';

/** Default options applied when the caller does not specify a value. */
const DEFAULTS: Omit<Required<UnsealOptions>, 'auditOptions'> = {
	stripOverlays: true,
	stripAnnotations: true,
	extractPriorRevision: true,
	annotateCandidates: true,
	output: 'both',
	includeAudit: true,
};

/**
 * Attempts to strip fake redactions from the given PDF and return a usable document.
 * Runs all enabled recovery scenarios and returns an UnsealResult.
 *
 * @param pdf - The PDF file as an ArrayBuffer.
 * @param options - Which recovery steps to enable. Defaults to all scenarios.
 */
export async function unseal(pdf: ArrayBuffer, options: UnsealOptions = {}): Promise<UnsealResult> {
	const opts = { ...DEFAULTS, ...options };

	// Run audit in parallel with recovery if requested.
	// Tier 1 checks are always on; caller can enable Tier 2/3 via auditOptions.
	const auditPromise = opts.includeAudit
		? audit(pdf, {
				textUnderBox: true,
				incrementalSave: true,
				metadataLeak: true,
				pendingAnnotation: true,
				...opts.auditOptions,
			})
		: Promise.resolve(undefined);

	// Use ArrayBufferLike to accommodate pdf-lib's save() return type across TS versions.
	let workingPdf: Uint8Array<ArrayBufferLike> = new Uint8Array(pdf);
	let overlaysStripped = 0;
	let annotationsRemoved = 0;
	let priorRevisionRecovered = false;

	const allFindings: UnsealResult['findings'] = [];

	// Scenario A — strip filled-rectangle overlays.
	if (opts.stripOverlays) {
		const result = await stripOverlays(workingPdf.buffer as ArrayBuffer);
		overlaysStripped += result.count;
		allFindings.push(...result.findings);
		if (result.count > 0) {
			workingPdf = toPlainUint8Array(result.pdf);
		}
	}

	// Scenario B — remove Redact-subtype annotations.
	if (opts.stripAnnotations) {
		const result = await stripAnnotations(workingPdf.buffer as ArrayBuffer);
		annotationsRemoved += result.count;
		allFindings.push(...result.findings);
		if (result.count > 0) {
			workingPdf = toPlainUint8Array(result.pdf);
		}
	}

	// Scenario C — extract prior revision from incremental save.
	if (opts.extractPriorRevision) {
		const result = extractPriorRevision(new Uint8Array(pdf));
		if (result.priorRevisionPdf && result.finding) {
			priorRevisionRecovered = true;
			allFindings.push(result.finding);
		}
	}

	// Scenario D — annotate candidate regions where content-stream text removal is detected.
	if (opts.annotateCandidates) {
		// Identify pages where overlays were stripped (Scenario A findings).
		const scenarioAFindings = allFindings.filter((f) => f.scenario === 'A');
		if (scenarioAFindings.length > 0) {
			const { annotateStrippedRegions } = await import('./recovery/annotate-candidates.js');
			const result = await annotateStrippedRegions(workingPdf.buffer as ArrayBuffer, scenarioAFindings);
			workingPdf = toPlainUint8Array(result.pdf);
			allFindings.push(...result.findings);
		}
	}

	const auditReport = await auditPromise;

	const result: UnsealResult = {
		findings: allFindings,
		overlaysStripped,
		annotationsRemoved,
		priorRevisionRecovered,
	};

	if (opts.output === 'pdf' || opts.output === 'both') {
		result.pdf = workingPdf;
	}

	if (opts.includeAudit && auditReport) {
		result.auditReport = auditReport;
	}

	return result;
}
