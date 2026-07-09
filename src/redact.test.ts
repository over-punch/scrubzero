// Unit tests for redact() function
import { describe, it, expect } from 'vitest';
import { redact } from './redact.js';
import type { RedactionRegion } from './types.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/** Minimal blank single-page PDF */
async function emptyPdf(): Promise<ArrayBuffer> {
	const doc = await PDFDocument.create();
	doc.addPage([612, 792]);
	const bytes = await doc.save();
	return bytes.buffer.slice(0) as ArrayBuffer;
}

/** PDF with text drawn at a known position, returned with the page height */
async function pdfWithText(): Promise<{ pdf: ArrayBuffer; pageHeight: number; textY: number }> {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const pageHeight = page.getHeight(); // 792
	// Draw at y=400 in bottom-left space
	page.drawText('Redact this text', { x: 100, y: 400, size: 12, font, color: rgb(0, 0, 0) });
	const bytes = await doc.save();
	return { pdf: bytes.buffer.slice(0) as ArrayBuffer, pageHeight, textY: 400 };
}

/** A 1×1 red PNG — the smallest valid raster image, embedded to simulate a scan. */
const RED_PIXEL_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64',
);

/** PDF whose entire page is a raster image and has no extractable text (a "scan"). */
async function pdfScannedPage(): Promise<ArrayBuffer> {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	const img = await doc.embedPng(RED_PIXEL_PNG);
	// Scale the 1×1 image to cover the whole page — a rasterised document page.
	page.drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
	const bytes = await doc.save();
	return bytes.buffer.slice(0) as ArrayBuffer;
}

describe('redact', () => {
	it('returns redactedCount 0 and a valid PDF when regions array is empty', async () => {
		const pdf = await emptyPdf();
		const result = await redact(pdf, []);
		expect(result.redactedCount).toBe(0);
		expect(result.pagesAffected).toHaveLength(0);
		expect(result.pdf).toBeInstanceOf(Uint8Array);
		expect(result.pdf.length).toBeGreaterThan(0);
	});

	it('returns redactedCount matching the number of regions provided', async () => {
		const pdf = await emptyPdf();
		const regions: RedactionRegion[] = [
			{ page: 1, x: 50, y: 100, width: 200, height: 20 },
			{ page: 1, x: 50, y: 150, width: 200, height: 20 },
		];
		const result = await redact(pdf, regions);
		expect(result.redactedCount).toBe(2);
		expect(result.pagesAffected).toEqual([1]);
	});

	it('tracks pagesAffected correctly across multiple pages', async () => {
		const doc = await PDFDocument.create();
		doc.addPage([612, 792]);
		doc.addPage([612, 792]);
		doc.addPage([612, 792]);
		const bytes = await doc.save();
		const pdf = bytes.buffer.slice(0) as ArrayBuffer;

		const regions: RedactionRegion[] = [
			{ page: 1, x: 50, y: 100, width: 100, height: 20 },
			{ page: 3, x: 50, y: 100, width: 100, height: 20 },
		];
		const result = await redact(pdf, regions);
		expect(result.pagesAffected).toEqual([1, 3]);
	});

	it('silently skips regions whose page number exceeds the document page count', async () => {
		const pdf = await emptyPdf(); // 1 page
		const result = await redact(pdf, [{ page: 5, x: 50, y: 100, width: 100, height: 20 }]);
		expect(result.redactedCount).toBe(0);
		expect(result.pagesAffected).toHaveLength(0);
	});

	it('produces a valid PDF output that can be re-loaded by pdf-lib', async () => {
		const pdf = await emptyPdf();
		const result = await redact(pdf, [{ page: 1, x: 50, y: 100, width: 200, height: 20 }]);
		const reloaded = await PDFDocument.load(result.pdf);
		expect(reloaded.getPageCount()).toBe(1);
	});

	it('includes a manifest when generateManifest is true', async () => {
		const pdf = await emptyPdf();
		const result = await redact(pdf, [{ page: 1, x: 50, y: 100, width: 200, height: 20 }], {
			generateManifest: true,
		});
		expect(result.manifest).toBeDefined();
		expect(result.manifest!.entries).toHaveLength(1);
		expect(result.manifest!.sha256Input).toMatch(/^[0-9a-f]{64}$/);
		expect(result.manifest!.sha256Output).toMatch(/^[0-9a-f]{64}$/);
		expect(result.manifest!.sha256Input).not.toBe(result.manifest!.sha256Output);
	});

	it('does not include a manifest when generateManifest is false (default)', async () => {
		const pdf = await emptyPdf();
		const result = await redact(pdf, [{ page: 1, x: 50, y: 100, width: 200, height: 20 }]);
		expect(result.manifest).toBeUndefined();
	});

	it('succeeds with addRedactionMarkers: true', async () => {
		const pdf = await emptyPdf();
		const result = await redact(pdf, [{ page: 1, x: 50, y: 100, width: 200, height: 20 }], {
			addRedactionMarkers: true,
		});
		expect(result.redactedCount).toBe(1);
		expect(result.pdf).toBeInstanceOf(Uint8Array);
	});

	it('uses a custom color when provided on a region', async () => {
		const pdf = await emptyPdf();
		// Should not throw — just confirms the color path works
		const result = await redact(pdf, [
			{ page: 1, x: 50, y: 100, width: 200, height: 20, color: [0.8, 0, 0] },
		]);
		expect(result.redactedCount).toBe(1);
	});

	it('handles a PDF with actual text — content stream scrub does not crash', async () => {
		const { pdf, pageHeight, textY } = await pdfWithText();
		// Region positioned over the drawn text (top-left origin)
		const topLeftY = pageHeight - textY - 12; // 12pt font
		const result = await redact(pdf, [
			{ page: 1, x: 95, y: topLeftY - 2, width: 230, height: 20 },
		]);
		expect(result.redactedCount).toBe(1);
		expect(result.pdf).toBeInstanceOf(Uint8Array);
	});

	it('always returns a warnings array', async () => {
		const pdf = await emptyPdf();
		const result = await redact(pdf, []);
		expect(Array.isArray(result.warnings)).toBe(true);
		expect(result.warnings).toHaveLength(0);
	});

	it('warns that a bar over a scanned (image-only) page removes nothing', async () => {
		const pdf = await pdfScannedPage();
		const result = await redact(pdf, [{ page: 1, x: 50, y: 100, width: 300, height: 40 }]);
		// The bar is drawn, but the image pixels underneath are untouched.
		expect(result.redactedCount).toBe(1);
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.warnings.some((w) => w.type === 'scanned-page' && w.page === 1)).toBe(true);
	});

	it('does not warn when a bar covers real text that gets scrubbed', async () => {
		const { pdf, pageHeight, textY } = await pdfWithText();
		const topLeftY = pageHeight - textY - 12;
		const result = await redact(pdf, [
			{ page: 1, x: 95, y: topLeftY - 2, width: 230, height: 20 },
		]);
		expect(result.warnings).toHaveLength(0);
	});
});
