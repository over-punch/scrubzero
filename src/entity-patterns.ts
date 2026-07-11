// entity-patterns.ts — pre-built SearchPattern definitions for common sensitive entity types

import type { SearchPattern, RedactOptions, RedactResult } from './types.js';
import { searchAndRedact } from './search-and-redact.js';

/**
 * Supported entity types for automatic redaction.
 * Each type has a corresponding pre-built regex pattern.
 */
export type EntityType =
	| 'ssn' // Social Security Number: 123-45-6789
	| 'phone' // US/international phone numbers
	| 'email' // Email addresses
	| 'credit-card' // Credit card numbers (major formats)
	| 'ip-address' // IPv4 addresses
	| 'date' // Common date formats (M/D/Y, Month D, YYYY, etc.)
	| 'name' // Heuristic: capitalized word pairs that look like personal names
	| 'attorney-client-marker'; // Legal privilege markers

/** An entity pattern extends SearchPattern with the entity type for identification */
export interface EntityPattern extends SearchPattern {
	entityType: EntityType;
}

/**
 * Pre-built patterns for common entity types.
 * Each pattern has the global flag set for use with matchAll/exec loops.
 */
export const EntityPatterns: Record<EntityType, SearchPattern> = {
	ssn: {
		pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
		label: 'SSN',
	},
	phone: {
		// Matches US and some international formats: (555) 555-5555, 555-555-5555, +1 555 555 5555, etc.
		pattern: /(?:\+1[-.\s]?)?\(?(\d{3})\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
		label: 'Phone',
	},
	email: {
		// Standard email address format
		pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
		label: 'Email',
	},
	'credit-card': {
		// Matches Visa (4xxx), Mastercard (5x-5x), Discover (6011), AmEx (3x) with optional separators
		pattern:
			/\b(?:4\d{3}|5[1-5]\d{2}|6011|3[47]\d{2})[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
		label: 'Credit Card',
	},
	'ip-address': {
		// IPv4 addresses
		pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
		label: 'IP Address',
	},
	date: {
		// Matches: 1/31/2024, 01-31-24, January 31, 2024, Jan. 31, 2024, etc.
		pattern:
			/\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/gi,
		label: 'Date',
	},
	name: {
		// Conservative heuristic: capitalized word pairs not at start of sentence
		// Matches "John Smith" but not "The Court" or "United States"
		pattern: /(?<!\. )(?<![A-Z])[A-Z][a-z]{1,15}\s+[A-Z][a-z]{1,15}(?!\s+[A-Z])/g,
		label: 'Name',
	},
	'attorney-client-marker': {
		// Common legal privilege markers (case-insensitive)
		pattern:
			/\b(?:ATTORNEY[-–—]CLIENT\s+PRIVILEGE|PRIVILEGED\s+AND\s+CONFIDENTIAL|WORK\s+PRODUCT|ATTORNEY WORK PRODUCT|PRIVILEGED COMMUNICATION)\b/gi,
		label: 'Privilege Marker',
	},
};

/**
 * Sensible default FOIA exemption codes per entity type, for public-records
 * redaction. PII falls under Exemption 6 (personal privacy); privilege markers
 * under Exemption 5 (deliberative/attorney work product). Callers can override
 * per type via the `exemptions` argument to redactEntities().
 */
export const DEFAULT_FOIA_EXEMPTIONS: Record<EntityType, { code: string; basis: string }> = {
	ssn: { code: '(b)(6)', basis: 'Personal privacy' },
	phone: { code: '(b)(6)', basis: 'Personal privacy' },
	email: { code: '(b)(6)', basis: 'Personal privacy' },
	'credit-card': { code: '(b)(6)', basis: 'Personal privacy' },
	'ip-address': { code: '(b)(6)', basis: 'Personal privacy' },
	date: { code: '(b)(6)', basis: 'Personal privacy' },
	name: { code: '(b)(6)', basis: 'Personal privacy' },
	'attorney-client-marker': { code: '(b)(5)', basis: 'Attorney work product / deliberative' },
};

/**
 * Redact all occurrences of the specified entity types in a PDF.
 * Uses pre-built regex patterns for each entity type.
 *
 * `exemptions` optionally maps an entity type to an exemption code (e.g.
 * `{ ssn: '(b)(6)' }`). Any code provided is stamped on the bar (when
 * `options.addRedactionMarkers` is on) and recorded per-match in the manifest
 * (when `options.generateManifest` is on).
 */
export async function redactEntities(
	pdf: ArrayBuffer,
	entityTypes: EntityType[],
	options?: RedactOptions,
	exemptions?: Partial<Record<EntityType, string>>,
): Promise<RedactResult> {
	if (entityTypes.length === 0) {
		const { PDFDocument } = await import('pdf-lib');
		const pdfLibDoc = await PDFDocument.load(pdf);
		const outBytes = await pdfLibDoc.save();
		return { pdf: outBytes, redactedCount: 0, pagesAffected: [], warnings: [] };
	}

	// Build a fresh copy of each pattern (regex flags include 'g' which is stateful)
	const patterns: SearchPattern[] = entityTypes.map((type) => {
		const base = EntityPatterns[type];
		// Re-create the RegExp so lastIndex is fresh
		const srcPattern = base.pattern;
		const freshPattern =
			srcPattern instanceof RegExp
				? new RegExp(srcPattern.source, srcPattern.flags)
				: srcPattern;
		const pattern: SearchPattern = { ...base, pattern: freshPattern };
		const code = exemptions?.[type];
		if (code !== undefined) {
			pattern.exemptionCode = code;
			pattern.exemptionBasis = DEFAULT_FOIA_EXEMPTIONS[type]?.basis;
		}
		return pattern;
	});

	return searchAndRedact(pdf, patterns, options);
}
