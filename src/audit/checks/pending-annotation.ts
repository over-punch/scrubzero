// Check for unapplied Redact annotations — markings that signal intent to redact but haven't been applied.

import type { AuditFinding } from '../types.js';

/** Scans a single page for Redact-subtype annotations (unapplied redaction marks). */
export async function checkPendingAnnotation(
	pdf: ArrayBuffer,
	pageNum: number,
): Promise<AuditFinding[]> {
	const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');

	const doc = await getDocument({ data: pdf.slice(0) }).promise;

	if (pageNum > doc.numPages) {
		await doc.destroy();
		return [];
	}

	const page = await doc.getPage(pageNum);
	let annotations: Array<{ subtype: string; rect: [number, number, number, number] }>;

	try {
		annotations = await page.getAnnotations() as typeof annotations;
	} finally {
		page.cleanup();
		await doc.destroy();
	}

	return annotations
		.filter((a) => a.subtype === 'Redact')
		.map((a) => ({
			check: 'pending-annotation' as const,
			severity: 'CRITICAL' as const,
			page: pageNum,
			bbox: a.rect,
			detail: `Unapplied redaction annotation on page ${pageNum} — underlying text has NOT been removed from the file`,
		}));
}
