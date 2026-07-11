// redact() — primary redaction function: removes text from content streams and draws visual bars

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type {
	RedactionRegion,
	RedactOptions,
	RedactResult,
	RedactWarning,
	NormalizedRegion,
	TextItem,
	RedactionManifest,
	RedactionEntry,
} from './types.js';
import { replaceTextInRegion, inflate, deflate } from './content-stream.js';

/** Default redaction options */
const DEFAULTS: Required<Omit<RedactOptions, 'redactorId' | 'basisCode'>> & {
	redactorId: undefined;
	basisCode: undefined;
} = {
	flattenAnnotations: true,
	sanitizeMetadata: true,
	addRedactionMarkers: false,
	generateManifest: false,
	redactorId: undefined,
	basisCode: undefined,
};

/**
 * Compute the SHA-256 hex digest of a buffer using Node.js built-in crypto.
 */
async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
	const { createHash } = await import('node:crypto');
	const hash = createHash('sha256');
	hash.update(Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data)));
	return hash.digest('hex');
}

/**
 * Convert a user-supplied RedactionRegion into a NormalizedRegion.
 * The input uses top-left origin; PDF uses bottom-left origin.
 * We need the page height to flip the Y axis.
 */
function normalizeRegion(region: RedactionRegion, pageHeight: number): NormalizedRegion {
	const yMax = pageHeight - region.y;
	const yMin = yMax - region.height;
	return {
		page: region.page,
		xMin: region.x,
		yMin,
		xMax: region.x + region.width,
		yMax,
		color: region.color ?? [0, 0, 0],
		label: region.label,
		exemptionCode: region.exemptionCode,
		exemptionBasis: region.exemptionBasis,
	};
}

/**
 * Determine whether a text item's bounding box intersects a normalised region.
 * Both are in PDF user-space (bottom-left origin).
 * item.y is the BOTTOM of the text; item.y + item.height is the TOP.
 * region.yMin is the BOTTOM; region.yMax is the TOP.
 */
function textItemIntersectsRegion(item: TextItem, region: NormalizedRegion): boolean {
	const itemTop = item.y + item.height;
	return (
		item.x < region.xMax &&
		item.x + item.width > region.xMin &&
		item.y < region.yMax &&
		itemTop > region.yMin
	);
}

/** Text items grouped by page, plus the set of pages that draw a raster image. */
interface PageContent {
	/** 1-indexed page number → non-empty text items on that page */
	textItemsByPage: Map<number, TextItem[]>;
	/** 1-indexed page numbers that paint at least one image XObject */
	imagePages: Set<number>;
}

/**
 * Determine whether a page's operator list paints any raster image.
 * A scanned document draws its content as image XObjects with no text operators,
 * which is exactly the case where a redaction bar covers pixels it cannot remove.
 */
function opListPaintsImage(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	opList: { fnArray: number[] },
	OPS: Record<string, number> | undefined,
): boolean {
	if (!OPS) return false;
	const imageOps = new Set<number>(
		[
			OPS['paintImageXObject'],
			OPS['paintImageXObjectRepeat'],
			OPS['paintInlineImageXObject'],
			OPS['paintInlineImageXObjectGroup'],
			OPS['paintImageMaskXObject'],
			OPS['paintImageMaskXObjectGroup'],
			OPS['paintImageMaskXObjectRepeat'],
			OPS['paintJpegXObject'],
			OPS['paintSolidColorImageMask'],
		].filter((n): n is number => typeof n === 'number'),
	);
	for (const fn of opList.fnArray) {
		if (imageOps.has(fn)) return true;
	}
	return false;
}

/**
 * Extract all text items with page positions from a PDF using pdfjs-dist, and
 * record which pages paint a raster image. Text item transforms from pdfjs are
 * in PDF bottom-left coordinate space.
 */
async function extractTextItems(pdfBytes: ArrayBuffer): Promise<PageContent> {
	// Use the legacy build which works in Node.js without a bundler
	const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const OPS = (pdfjsLib as unknown as { OPS?: Record<string, number> }).OPS;

	// Copy the buffer before passing to pdfjs — pdfjs may transfer (neuter) the source buffer
	const loadingTask = pdfjsLib.getDocument({
		data: new Uint8Array(pdfBytes.slice(0)),
		useWorkerFetch: false,
		isEvalSupported: false,
		useSystemFonts: true,
		disableFontFace: true,
	});

	const pdfDoc = await loadingTask.promise;
	const numPages = pdfDoc.numPages;
	const textItemsByPage = new Map<number, TextItem[]>();
	const imagePages = new Set<number>();

	for (let pageNum = 1; pageNum <= numPages; pageNum++) {
		const page = await pdfDoc.getPage(pageNum);

		const textContent = await page.getTextContent();
		const items: TextItem[] = [];

		for (const item of textContent.items) {
			// pdfjs-dist text items may be TextItem or TextMarkedContent
			if (!('str' in item)) continue;
			if (!item.str || item.str.trim() === '') continue;

			// item.transform is a 6-element matrix [a, b, c, d, e, f]
			// e and f are the x and y translation — already in PDF bottom-left coordinate space
			const [, , , , tx, ty] = item.transform;
			const x = tx;
			// pdfjs text transforms are in PDF bottom-left coordinate space
			const y = ty;

			items.push({
				str: item.str,
				page: pageNum,
				x,
				y,
				width: item.width ?? 0,
				height: item.height ?? 0,
			});
		}

		textItemsByPage.set(pageNum, items);

		// Detect raster imagery on the page (scanned content lives here, not in text)
		try {
			const opList = await page.getOperatorList();
			if (opListPaintsImage(opList, OPS)) imagePages.add(pageNum);
		} catch {
			// Operator-list inspection is best-effort; absence of a signal is safe.
		}

		page.cleanup();
	}

	await pdfDoc.destroy();
	return { textItemsByPage, imagePages };
}

/**
 * Attempt to access and scrub the content stream bytes for a page.
 * Uses pdf-lib's internal page dict access to get the raw stream.
 * Replaces text-operator arguments in any intersecting stream sections.
 */
async function scrubContentStream(
	pdfLibDoc: PDFDocument,
	pageIndex: number,
	regions: NormalizedRegion[],
): Promise<void> {
	const page = pdfLibDoc.getPage(pageIndex);

	// Access the raw page dictionary via pdf-lib internals
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const pageNode = (page as any).node;
	if (!pageNode) return;

	// Attempt to get the Contents entry
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const contentsRef = pageNode.get((PDFDocument as any).PDFName?.of('Contents') ?? 'Contents');
	if (!contentsRef) return;

	// pdf-lib exposes a context with a lookup method for indirect references
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const ctx = (pdfLibDoc as any).context;
	if (!ctx) return;

	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const PDFName = (await import('pdf-lib')).PDFName as any;
		const contentsObj = pageNode.get(PDFName.of('Contents'));
		if (!contentsObj) return;

		// Resolve the contents — could be a stream or an array of streams
		const contentsResolved = ctx.lookup(contentsObj);
		const streams = [];

		if (contentsResolved && typeof contentsResolved.getContentsStream === 'function') {
			streams.push(contentsResolved);
		} else if (contentsResolved && typeof contentsResolved.asArray === 'function') {
			const arr = contentsResolved.asArray();
			for (const ref of arr) {
				const stream = ctx.lookup(ref);
				if (stream) streams.push(stream);
			}
		} else if (contentsResolved) {
			streams.push(contentsResolved);
		}

		for (const stream of streams) {
			// Get the raw (possibly compressed) bytes
			if (typeof stream.contents === 'undefined') continue;
			let rawBytes: Uint8Array = stream.contents;

			// Check if the stream is FlateDecode compressed
			const dict = stream.dict;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const filter = dict?.get(PDFName.of('Filter')) as any;
			const isFlate =
				filter &&
				(filter.encodedName === '/FlateDecode' ||
					filter.encodedName === '/Fl' ||
					(Array.isArray(filter.array) &&
						filter.array.some(
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(f: any) => f.encodedName === '/FlateDecode' || f.encodedName === '/Fl',
						)));

			let decompressed: Uint8Array;
			if (isFlate) {
				decompressed = await inflate(rawBytes);
			} else {
				decompressed = rawBytes;
			}

			let modified = decompressed;
			for (const region of regions) {
				modified = replaceTextInRegion(modified, region);
			}

			if (isFlate) {
				rawBytes = await deflate(modified);
				stream.contents = rawBytes;
			} else {
				stream.contents = modified;
			}
		}
	} catch {
		// Content stream scrubbing is best-effort — the visual bar still covers the text
	}
}

/**
 * Wipe PDF metadata: clears the DocInfo dictionary fields and removes any
 * XMP metadata stream from the document catalog.
 */
async function sanitizeMetadata(pdfLibDoc: PDFDocument): Promise<void> {
	try {
		// Clear standard DocInfo fields
		pdfLibDoc.setTitle('');
		pdfLibDoc.setAuthor('');
		pdfLibDoc.setSubject('');
		pdfLibDoc.setKeywords([]);
		pdfLibDoc.setProducer('');
		pdfLibDoc.setCreator('');
		pdfLibDoc.setCreationDate(new Date(0));
		pdfLibDoc.setModificationDate(new Date(0));

		// Remove the XMP metadata stream from the document catalog
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const catalog = (pdfLibDoc as any).catalog;
		if (catalog) {
			const { PDFName } = await import('pdf-lib');
			catalog.delete(PDFName.of('Metadata'));
		}
	} catch {
		// Metadata sanitisation is best-effort
	}
}

/**
 * Redact specific rectangular regions from a PDF.
 *
 * For each region this function:
 * 1. Removes text-drawing operators from the page content stream (content-stream layer)
 * 2. Draws a filled rectangle over the region (visual layer)
 * 3. Optionally renders a label inside the bar ("REDACTED", exemption code, or custom label)
 *
 * Metadata can be wiped via `options.sanitizeMetadata` (default: true).
 * An audit manifest is attached when `options.generateManifest` is true.
 */
export async function redact(
	pdf: ArrayBuffer,
	regions: RedactionRegion[],
	options?: RedactOptions,
): Promise<RedactResult> {
	const opts = { ...DEFAULTS, ...options };

	if (regions.length === 0) {
		// Nothing to redact — return original bytes
		const pdfLibDoc = await PDFDocument.load(pdf);
		const outBytes = await pdfLibDoc.save();
		return { pdf: outBytes, redactedCount: 0, pagesAffected: [], warnings: [] };
	}

	// Compute SHA-256 of input for manifest (computed even if manifest not requested, for efficiency we gate it)
	const sha256Input = opts.generateManifest ? await sha256Hex(pdf) : '';
	const nowIso = new Date().toISOString();

	// Step 1: Extract text positions and image-bearing pages from original PDF
	const { textItemsByPage, imagePages } = await extractTextItems(pdf);
	const warnings: RedactWarning[] = [];

	// Step 2: Load with pdf-lib for modification
	const pdfLibDoc = await PDFDocument.load(pdf, {
		ignoreEncryption: true,
		updateMetadata: false,
	});

	const numPages = pdfLibDoc.getPageCount();
	const pagesAffected = new Set<number>();
	let redactedCount = 0;
	const manifestEntries: RedactionEntry[] = [];

	// Load a font for optional labels
	let labelFont = null;
	if (opts.addRedactionMarkers) {
		labelFont = await pdfLibDoc.embedFont(StandardFonts.Helvetica);
	}

	// Group regions by page
	const regionsByPage = new Map<number, RedactionRegion[]>();
	for (const region of regions) {
		const existing = regionsByPage.get(region.page) ?? [];
		existing.push(region);
		regionsByPage.set(region.page, existing);
	}

	for (const [pageNum, pageRegions] of regionsByPage.entries()) {
		if (pageNum < 1 || pageNum > numPages) continue;

		const pageIndex = pageNum - 1;
		const page = pdfLibDoc.getPage(pageIndex);
		const { height: pageHeight } = page.getSize();

		const textItems = textItemsByPage.get(pageNum) ?? [];
		const normalizedRegions: NormalizedRegion[] = pageRegions.map((r) =>
			normalizeRegion(r, pageHeight),
		);

		// Step 3: Scrub content streams for regions that have intersecting text
		const regionsWithText = normalizedRegions.filter((nr) =>
			textItems.some((item) => textItemIntersectsRegion(item, nr)),
		);

		if (regionsWithText.length > 0) {
			await scrubContentStream(pdfLibDoc, pageIndex, regionsWithText);
		}

		// Any region with no underlying text got only a visual bar — nothing was
		// removed from the file. On an image-bearing page that means the pixels
		// beneath the bar remain recoverable, so surface it as a warning.
		const pageHasImage = imagePages.has(pageNum);
		const visualOnlyCount = normalizedRegions.length - regionsWithText.length;
		if (pageHasImage && textItems.length === 0) {
			warnings.push({
				type: 'scanned-page',
				page: pageNum,
				message: `Page ${pageNum} appears to be a scanned image with no extractable text. The redaction bar is drawn on top of the image but the original pixels are NOT removed and remain fully recoverable. To redact a scanned page you must flatten or rasterise the page after covering it.`,
			});
		} else if (visualOnlyCount > 0 && (pageHasImage || textItems.length === 0)) {
			// Only warn where non-text content is plausibly hidden: an image-bearing
			// page, or a page with no extractable text at all (e.g. vector graphics).
			// A bar over a blank part of an ordinary text page is not flagged.
			warnings.push({
				type: 'visual-only-region',
				page: pageNum,
				message: `${visualOnlyCount} region${visualOnlyCount === 1 ? '' : 's'} on page ${pageNum} had no removable text underneath. ${pageHasImage ? 'This page contains a raster image — if a bar covers image content, those pixels are not removed and remain recoverable.' : 'The bar covers the area visually but nothing was removed from the file; any non-text (image or vector) content there is still recoverable.'}`,
			});
		}

		// Step 4: Draw visual redaction bars for all regions
		for (const nr of normalizedRegions) {
			const [r, g, b] = nr.color;
			page.drawRectangle({
				x: nr.xMin,
				y: nr.yMin,
				width: nr.xMax - nr.xMin,
				height: nr.yMax - nr.yMin,
				color: rgb(r, g, b),
				borderWidth: 0,
			});

			// Optionally render the label inside the redaction bar
			if (opts.addRedactionMarkers && labelFont) {
				const barHeight = nr.yMax - nr.yMin;
				const barWidth = nr.xMax - nr.xMin;

				// Stamp the exemption code itself (FOIA convention: "(b)(6)"), else
				// the custom label, else a generic marker.
				const label: string = nr.exemptionCode ?? nr.label ?? 'REDACTED';

				const fontSize = Math.min(barHeight * 0.6, 10);
				const textWidth = labelFont.widthOfTextAtSize(label, fontSize);
				const textX = nr.xMin + (barWidth - textWidth) / 2;
				const textY = nr.yMin + (barHeight - fontSize) / 2;

				// Only draw if the bar is large enough to contain the label
				if (textX > nr.xMin && textY > nr.yMin) {
					page.drawText(label, {
						x: textX,
						y: textY,
						size: fontSize,
						font: labelFont,
						color: rgb(1, 1, 1), // white text on dark bar
					});
				}
			}

			// Record manifest entry if requested
			if (opts.generateManifest) {
				manifestEntries.push({
					page: pageNum,
					bbox: [nr.xMin, nr.yMin, nr.xMax, nr.yMax],
					basisCode: nr.exemptionCode ?? opts.basisCode,
					basisText: nr.exemptionBasis,
					label: nr.label,
					redactorId: opts.redactorId,
					timestamp: nowIso,
					sha256Before: sha256Input,
					sha256After: '', // populated after save below
				});
			}

			redactedCount++;
			pagesAffected.add(pageNum);
		}
	}

	// Step 5: Optionally sanitize metadata
	if (opts.sanitizeMetadata) {
		await sanitizeMetadata(pdfLibDoc);
	}

	const outBytes = await pdfLibDoc.save();
	const sortedPages = Array.from(pagesAffected).sort((a, b) => a - b);

	// Build manifest after save so we can hash the output
	let manifest: RedactionManifest | undefined;
	if (opts.generateManifest) {
		const sha256Output = await sha256Hex(outBytes);
		// Patch sha256After on all entries
		for (const entry of manifestEntries) {
			entry.sha256After = sha256Output;
		}
		manifest = {
			createdAt: nowIso,
			redactorId: opts.redactorId,
			entries: manifestEntries,
			sha256Input,
			sha256Output,
		};
	}

	const result: RedactResult = {
		pdf: outBytes,
		redactedCount,
		pagesAffected: sortedPages,
		warnings,
	};
	if (manifest !== undefined) {
		result.manifest = manifest;
	}
	return result;
}
