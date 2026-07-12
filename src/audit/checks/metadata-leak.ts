// Check for sensitive information leaking through PDF metadata fields and XMP streams.

import type { AuditFinding } from '../types.js';

/** Patterns that may indicate sensitive data in metadata fields. */
const SENSITIVE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
	{ label: 'email address', pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/ },
	{ label: 'phone number', pattern: /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/ },
	{ label: 'SSN-like pattern', pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
	{ label: 'IP address', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ },
	{ label: 'URL', pattern: /https?:\/\/[^\s<>"{}|\\^\[\]`]+/ },
];

/** Known metadata field names to scan from the Info dictionary. */
const INFO_FIELDS = [
	'Title',
	'Author',
	'Subject',
	'Keywords',
	'Creator',
	'Producer',
	'CreationDate',
	'ModDate',
	'Trapped',
] as const;

/** Scans PDF metadata (Info dict + XMP) for sensitive patterns and non-empty fields. */
export async function checkMetadataLeak(pdf: ArrayBuffer): Promise<AuditFinding[]> {
	const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');

	const doc = await getDocument({ data: pdf.slice(0) }).promise;

	// pdfjs metadata types are loosely typed — use unknown and narrow explicitly.
	let rawMetadata: unknown;
	try {
		rawMetadata = await doc.getMetadata();
	} finally {
		await doc.destroy();
	}

	const findings: AuditFinding[] = [];

	if (!rawMetadata || typeof rawMetadata !== 'object') return findings;

	const metaObj = rawMetadata as Record<string, unknown>;
	const info = (metaObj['info'] ?? {}) as Record<string, unknown>;

	// Check the Info dictionary fields.
	for (const field of INFO_FIELDS) {
		const value = info[field];
		if (!value || typeof value !== 'string' || !value.trim()) continue;

		// Always emit INFO for non-empty metadata fields.
		findings.push({
			check: 'metadata-leak',
			severity: 'INFO',
			detail: `Metadata field "${field}" contains: ${value.slice(0, 120)}`,
		});

		// Escalate to MEDIUM if a sensitive pattern is found.
		for (const { label, pattern } of SENSITIVE_PATTERNS) {
			if (pattern.test(value)) {
				findings.push({
					check: 'metadata-leak',
					severity: 'MEDIUM',
					detail: `Metadata field "${field}" may expose ${label}: ${value.slice(0, 120)}`,
				});
				break;
			}
		}
	}

	// Check XMP metadata blob if available.
	const xmpMeta = metaObj['metadata'];
	if (xmpMeta && typeof xmpMeta === 'object') {
		const xmpObj = xmpMeta as Record<string, unknown>;
		if (typeof xmpObj['getAll'] === 'function') {
			const all = (xmpObj['getAll'] as () => Record<string, unknown>)();
			for (const [key, val] of Object.entries(all)) {
				const strVal = typeof val === 'string' ? val : String(val);
				if (!strVal || strVal === 'undefined' || strVal === 'null') continue;
				for (const { label, pattern } of SENSITIVE_PATTERNS) {
					if (pattern.test(strVal)) {
						findings.push({
							check: 'metadata-leak',
							severity: 'MEDIUM',
							detail: `XMP metadata field "${key}" may expose ${label}: ${strVal.slice(0, 120)}`,
						});
						break;
					}
				}
			}
		}
	}

	return findings;
}
