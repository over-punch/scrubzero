// batch.ts — concurrent redaction of multiple PDFs with per-item error isolation

import type { RedactionRegion, SearchPattern, RedactOptions, RedactResult } from './types.js';
import { redact } from './redact.js';
import { searchAndRedact } from './search-and-redact.js';

/** A single item in a batch redaction job */
export interface BatchItem {
	/** The PDF to redact as an ArrayBuffer */
	pdf: ArrayBuffer;
	/** Coordinate-based regions to redact (optional) */
	regions?: RedactionRegion[];
	/** Text-search patterns to redact (optional) */
	patterns?: SearchPattern[];
	/** Per-item redaction options (optional) */
	options?: RedactOptions;
}

/** The result for one item in a batch job */
export interface BatchResult {
	/** 0-indexed position of this item in the input array */
	index: number;
	/** The redaction result, present if the item succeeded */
	result?: RedactResult;
	/** Error message, present if the item failed */
	error?: string;
}

/** Default concurrency limit for batch redaction */
const DEFAULT_CONCURRENCY = 4;

/**
 * Redact multiple PDFs concurrently with a concurrency limit.
 * Each item can specify regions (coordinate-based) or patterns (text search), or both.
 * If both are specified, patterns are searched first, then coordinate regions are applied.
 * Errors in individual items are caught and reported per-item without aborting the batch.
 */
export async function redactBatch(
	items: BatchItem[],
	concurrency: number = DEFAULT_CONCURRENCY,
): Promise<BatchResult[]> {
	const results: BatchResult[] = new Array(items.length);
	const limit = Math.max(1, concurrency);

	// Process in batches of `limit`
	for (let batchStart = 0; batchStart < items.length; batchStart += limit) {
		const batchEnd = Math.min(batchStart + limit, items.length);
		const batchSlice = items.slice(batchStart, batchEnd);

		const batchPromises = batchSlice.map(async (item, sliceIndex) => {
			const globalIndex = batchStart + sliceIndex;
			try {
				const result = await processItem(item);
				results[globalIndex] = { index: globalIndex, result };
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				results[globalIndex] = { index: globalIndex, error: message };
			}
		});

		await Promise.all(batchPromises);
	}

	return results;
}

/**
 * Process a single BatchItem, running patterns first then regions if both are specified.
 */
async function processItem(item: BatchItem): Promise<RedactResult> {
	const hasPatterns = Array.isArray(item.patterns) && item.patterns.length > 0;
	const hasRegions = Array.isArray(item.regions) && item.regions.length > 0;

	if (hasPatterns && hasRegions) {
		// Run search-and-redact first, then apply coordinate regions to the result
		const patternResult = await searchAndRedact(item.pdf, item.patterns!, item.options);
		// Copy to a fresh ArrayBuffer to avoid SharedArrayBuffer issues
		const intermediateBuffer = patternResult.pdf.buffer.slice(0) as ArrayBuffer;
		const regionResult = await redact(intermediateBuffer, item.regions!, item.options);
		// Merge result metadata
		const allPages = Array.from(
			new Set([...patternResult.pagesAffected, ...regionResult.pagesAffected]),
		).sort((a, b) => a - b);
		return {
			pdf: regionResult.pdf,
			redactedCount: patternResult.redactedCount + regionResult.redactedCount,
			pagesAffected: allPages,
			warnings: [...patternResult.warnings, ...regionResult.warnings],
		};
	}

	if (hasPatterns) {
		return searchAndRedact(item.pdf, item.patterns!, item.options);
	}

	if (hasRegions) {
		return redact(item.pdf, item.regions!, item.options);
	}

	// Neither patterns nor regions — return the PDF unmodified
	return redact(item.pdf, [], item.options);
}
