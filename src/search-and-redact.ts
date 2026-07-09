// searchAndRedact() — find text patterns in a PDF and redact all matches

import type {
	SearchPattern,
	RedactOptions,
	RedactResult,
	RedactionRegion,
	TextItem,
} from './types.js';
import { redact } from './redact.js';

interface TextExtractionResult {
	items: TextItem[];
	pageHeights: Map<number, number>;
}

/**
 * Extract all text items from every page and page heights in a single pdfjs pass.
 * Text item coordinates are in PDF bottom-left coordinate space.
 */
async function extractTextAndHeights(pdf: ArrayBuffer): Promise<TextExtractionResult> {
	const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

	const loadingTask = pdfjsLib.getDocument({
		data: new Uint8Array(pdf.slice(0)),
		useWorkerFetch: false,
		isEvalSupported: false,
		useSystemFonts: true,
		disableFontFace: true,
	});

	const pdfDoc = await loadingTask.promise;
	const numPages = pdfDoc.numPages;
	const allItems: TextItem[] = [];
	const pageHeights = new Map<number, number>();

	for (let pageNum = 1; pageNum <= numPages; pageNum++) {
		const page = await pdfDoc.getPage(pageNum);
		const vp = page.getViewport({ scale: 1 });
		pageHeights.set(pageNum, vp.height);

		const textContent = await page.getTextContent();

		for (const item of textContent.items) {
			if (!('str' in item)) continue;
			if (!item.str || item.str.trim() === '') continue;

			const [, , , , tx, ty] = item.transform;

			allItems.push({
				str: item.str,
				page: pageNum,
				x: tx,
				y: ty,
				width: item.width ?? 0,
				height: item.height ?? 0,
			});
		}

		page.cleanup();
	}

	await pdfDoc.destroy();
	return { items: allItems, pageHeights };
}

/**
 * Build a RegExp from a SearchPattern, normalising string patterns and
 * ensuring the global flag is set so matchAll works correctly.
 */
function buildRegExp(pattern: SearchPattern['pattern']): RegExp {
	if (pattern instanceof RegExp) {
		// Re-create with the global flag added if not present
		const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
		return new RegExp(pattern.source, flags);
	}
	// Escape special regex characters in literal strings
	const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(escaped, 'g');
}

/**
 * Merge adjacent or overlapping text items on the same page into a single
 * string, keeping track of each item's character positions for back-mapping.
 *
 * Returns an array of line groups, one per page. Each group contains:
 * - `text`: the concatenated string for matching
 * - `items`: the source TextItem objects in order
 * - `offsets`: the start character offset of each item within `text`
 */
interface PageTextGroup {
	page: number;
	text: string;
	items: TextItem[];
	offsets: number[];
}

function buildPageTextGroups(allItems: TextItem[]): PageTextGroup[] {
	// Group by page
	const byPage = new Map<number, TextItem[]>();
	for (const item of allItems) {
		const existing = byPage.get(item.page) ?? [];
		existing.push(item);
		byPage.set(item.page, existing);
	}

	const groups: PageTextGroup[] = [];

	for (const [page, items] of byPage.entries()) {
		// Sort by reading order: top-to-bottom, left-to-right
		// y is in bottom-left space so higher y = higher on page
		const sorted = [...items].sort((a, b) => {
			const yDiff = b.y - a.y;
			if (Math.abs(yDiff) > 2) return yDiff; // different lines
			return a.x - b.x; // same line, left to right
		});

		let text = '';
		const offsets: number[] = [];

		for (let i = 0; i < sorted.length; i++) {
			const item = sorted[i]!;
			offsets.push(text.length);
			text += item.str;
			// Add a space between items that are not adjacent
			const next = sorted[i + 1];
			if (next && Math.abs(next.y - item.y) > 2) {
				text += '\n';
			} else if (next) {
				text += ' ';
			}
		}

		groups.push({ page, text, items: sorted, offsets });
	}

	return groups;
}

/**
 * Given a character range within the concatenated page text, find all
 * TextItem objects whose text overlaps that range and return them.
 */
function findItemsForRange(
	group: PageTextGroup,
	matchStart: number,
	matchEnd: number,
): TextItem[] {
	const matched: TextItem[] = [];

	for (let i = 0; i < group.items.length; i++) {
		const item = group.items[i]!;
		const itemStart = group.offsets[i]!;
		const itemEnd = itemStart + item.str.length;

		// Overlap check
		if (itemEnd > matchStart && itemStart < matchEnd) {
			matched.push(item);
		}
	}

	return matched;
}

/**
 * Convert a set of matched TextItem objects into a RedactionRegion that
 * covers their bounding box on the page.
 * pageHeight is needed to convert from bottom-left PDF space back to
 * the top-left space that RedactionRegion uses.
 * Items have y = bottom of glyph in bottom-left space; y + height = top.
 */
function itemsToRegion(
	items: TextItem[],
	pageHeight: number,
	pattern: SearchPattern,
): RedactionRegion {
	let xMin = Infinity;
	let yMin = Infinity; // bottom of text group in bottom-left space
	let xMax = -Infinity;
	let yMax = -Infinity; // top of text group in bottom-left space

	for (const item of items) {
		xMin = Math.min(xMin, item.x);
		yMin = Math.min(yMin, item.y);
		xMax = Math.max(xMax, item.x + item.width);
		yMax = Math.max(yMax, item.y + item.height);
	}

	// Add a small padding around the bounding box (2 PDF units)
	const PADDING = 2;
	xMin -= PADDING;
	yMin -= PADDING;
	xMax += PADDING;
	yMax += PADDING;

	const page = items[0]!.page;

	// Convert from bottom-left space to top-left space for RedactionRegion.
	// yMax is the top of the text in bottom-left space, so pageHeight - yMax
	// gives the distance from the top of the page.
	const topLeftY = pageHeight - yMax;

	const region: RedactionRegion = {
		page,
		x: xMin,
		y: topLeftY,
		width: xMax - xMin,
		height: yMax - yMin,
	};
	if (pattern.color !== undefined) region.color = pattern.color;
	if (pattern.label !== undefined) region.label = pattern.label;
	return region;
}

/**
 * Search for text patterns in a PDF and redact all matching regions.
 *
 * For each SearchPattern:
 * 1. Extract text items and their positions from the PDF
 * 2. Build a concatenated text string per page for efficient regex matching
 * 3. Map every match back to the source TextItem bounding boxes
 * 4. Convert bounding boxes to RedactionRegions
 * 5. Call redact() with all discovered regions
 */
export async function searchAndRedact(
	pdf: ArrayBuffer,
	patterns: SearchPattern[],
	options?: RedactOptions,
): Promise<RedactResult> {
	if (patterns.length === 0) {
		const { PDFDocument } = await import('pdf-lib');
		const pdfLibDoc = await PDFDocument.load(pdf);
		const outBytes = await pdfLibDoc.save();
		return { pdf: outBytes, redactedCount: 0, pagesAffected: [], warnings: [] };
	}

	// Single pdfjs pass: extract text items and page heights together
	const { items: allItems, pageHeights } = await extractTextAndHeights(pdf);

	const pageGroups = buildPageTextGroups(allItems);
	const allRegions: RedactionRegion[] = [];

	// Build a map from page number to items for phiDetector calls
	const itemsByPage = new Map<number, TextItem[]>();
	for (const item of allItems) {
		const list = itemsByPage.get(item.page) ?? [];
		list.push(item);
		itemsByPage.set(item.page, list);
	}

	for (const pattern of patterns) {
		if (pattern.phiDetector !== undefined) {
			// PHI detector path: pass text items (with coordinates) to the detector
			for (const [pageNum, pageItems] of itemsByPage.entries()) {
				if (pattern.pages && pattern.pages.length > 0 && !pattern.pages.includes(pageNum)) {
					continue;
				}
				const detections = await pattern.phiDetector(pageItems, pageNum);
				const pageHeight = pageHeights.get(pageNum) ?? 0;
				for (const det of detections) {
					// detector returns bottom-left coords; RedactionRegion uses top-left
					const region: RedactionRegion = {
						page: pageNum,
						x: det.x,
						y: pageHeight - (det.y + det.height),
						width: det.width,
						height: det.height,
					};
					if (pattern.color !== undefined) region.color = pattern.color;
					if (pattern.label !== undefined) region.label = pattern.label;
					allRegions.push(region);
				}
			}
			continue;
		}

		const re = buildRegExp(pattern.pattern);

		for (const group of pageGroups) {
			if (pattern.pages && pattern.pages.length > 0 && !pattern.pages.includes(group.page)) {
				continue;
			}

			re.lastIndex = 0;

			let match: RegExpExecArray | null;
			while ((match = re.exec(group.text)) !== null) {
				const matchStart = match.index;
				const matchEnd = matchStart + match[0].length;

				const matchedItems = findItemsForRange(group, matchStart, matchEnd);
				if (matchedItems.length === 0) continue;

				const pageHeight = pageHeights.get(group.page) ?? 0;
				const region = itemsToRegion(matchedItems, pageHeight, pattern);
				allRegions.push(region);

				if (match[0].length === 0) {
					re.lastIndex++;
				}
			}
		}
	}

	return redact(pdf, allRegions, options);
}

/**
 * Redact PHI using a custom detector function.
 *
 * The detector receives text items with their PDF coordinates (bottom-left origin)
 * and returns bounding boxes of PHI regions in the same coordinate space.
 * This allows the detector to use the exact positions of text items when computing
 * which regions to redact, rather than inferring positions from plain text.
 */
export async function redactWithPHIDetector(
	pdf: ArrayBuffer,
	detector: (
		items: Array<{ str: string; x: number; y: number; width: number; height: number }>,
		pageNum: number,
	) => Promise<Array<{ x: number; y: number; width: number; height: number }>>,
	options?: RedactOptions,
): Promise<RedactResult> {
	const { items: allItems, pageHeights } = await extractTextAndHeights(pdf);

	const itemsByPage = new Map<number, TextItem[]>();
	for (const item of allItems) {
		const list = itemsByPage.get(item.page) ?? [];
		list.push(item);
		itemsByPage.set(item.page, list);
	}

	const allRegions: RedactionRegion[] = [];

	for (const [pageNum, pageItems] of itemsByPage.entries()) {
		const detections = await detector(pageItems, pageNum);
		const pageHeight = pageHeights.get(pageNum) ?? 0;

		for (const det of detections) {
			// detector returns bottom-left coords; RedactionRegion uses top-left
			allRegions.push({
				page: pageNum,
				x: det.x,
				y: pageHeight - (det.y + det.height),
				width: det.width,
				height: det.height,
			});
		}
	}

	return redact(pdf, allRegions, options);
}
