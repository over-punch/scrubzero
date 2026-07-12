// Recovery Scenario C: extract the prior PDF revision from an incremental save.

import type { UnsealFinding } from '../types.js';

/** Result returned by the prior revision extraction. */
export interface ExtractRevisionResult {
	priorRevisionPdf: Uint8Array | null;
	finding: UnsealFinding | null;
}

/**
 * Locates all %%EOF markers in the raw PDF bytes.
 * If more than one exists, slices the bytes at the first %%EOF to return
 * the prior revision, which may contain unredacted content.
 */
export function extractPriorRevision(pdfBytes: Uint8Array): ExtractRevisionResult {
	const decoder = new TextDecoder('latin1');
	const text = decoder.decode(pdfBytes);

	// Collect positions of all %%EOF markers.
	const eofPositions: number[] = [];
	let searchPos = 0;
	while (true) {
		const idx = text.indexOf('%%EOF', searchPos);
		if (idx === -1) break;
		eofPositions.push(idx);
		searchPos = idx + 1;
	}

	if (eofPositions.length < 2) {
		return { priorRevisionPdf: null, finding: null };
	}

	// The prior revision ends at the first %%EOF (inclusive, + 5 bytes for the marker itself).
	const firstEofPos = eofPositions[0];
	if (firstEofPos === undefined) {
		return { priorRevisionPdf: null, finding: null };
	}

	const cutoff = firstEofPos + 5;
	const priorRevisionPdf = pdfBytes.slice(0, cutoff);

	const finding: UnsealFinding = {
		scenario: 'C',
		confidence: 0.95,
		priorRevisionPdf,
	};

	return { priorRevisionPdf, finding };
}
