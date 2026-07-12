// Check for multiple %%EOF markers indicating incremental saves that may hide prior unredacted content.

import type { AuditFinding } from '../types.js';

/** Counts %%EOF markers in the raw PDF bytes — more than one signals an incremental save. */
export function checkIncrementalSave(pdfBytes: Uint8Array): AuditFinding[] {
	const decoder = new TextDecoder('latin1');
	const text = decoder.decode(pdfBytes);

	const matches = text.match(/%%EOF/g);
	const eofCount = matches ? matches.length : 0;

	if (eofCount <= 1) return [];

	return [
		{
			check: 'incremental-save',
			severity: 'HIGH',
			detail: `${eofCount} %%EOF markers found — prior revision may contain unredacted content. Run 'unseal strip' to extract it.`,
		},
	];
}
