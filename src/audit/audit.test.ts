// Smoke tests for the folded-in audit/unseal API (formerly @liiift-studio/unseal).
import { describe, it, expect } from 'vitest';
import { audit, unseal, AuditPresets } from '../index.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/** A PDF with DocInfo metadata and a bar drawn over text — a "fake redaction". */
async function fakeRedactedPdf(): Promise<ArrayBuffer> {
	const doc = await PDFDocument.create();
	doc.setTitle('Confidential — do not release');
	doc.setAuthor('Agent Smith');
	const page = doc.addPage([612, 792]);
	const font = await doc.embedFont(StandardFonts.Helvetica);
	page.drawText('SSN 123-45-6789', { x: 72, y: 700, size: 14, font, color: rgb(0, 0, 0) });
	page.drawRectangle({ x: 68, y: 696, width: 200, height: 22, color: rgb(0, 0, 0) });
	return (await doc.save()).buffer.slice(0) as ArrayBuffer;
}

describe('audit', () => {
	it('returns a well-formed AuditReport', async () => {
		const report = await audit(await fakeRedactedPdf(), AuditPresets.quick);
		expect(typeof report.clean).toBe('boolean');
		expect(Array.isArray(report.findings)).toBe(true);
		expect(report.sha256).toMatch(/^[0-9a-f]{64}$/);
		expect(typeof report.checkedAt).toBe('string');
	});

	it('flags metadata left in DocInfo as not clean', async () => {
		const report = await audit(await fakeRedactedPdf(), AuditPresets.quick);
		expect(report.clean).toBe(false);
		expect(report.findings.some((f) => f.check === 'metadata-leak')).toBe(true);
	});

	it('exposes quick / compliance / forensic presets', () => {
		for (const p of [AuditPresets.quick, AuditPresets.compliance, AuditPresets.forensic]) {
			expect(p.textUnderBox).toBe(true);
			expect(p.patternOracle).toBe(false); // AI oracle not bundled in scrubzero
		}
	});
});

describe('unseal', () => {
	it('returns a PDF and a findings array', async () => {
		const result = await unseal(await fakeRedactedPdf());
		expect(result.pdf).toBeInstanceOf(Uint8Array);
		expect(result.pdf.length).toBeGreaterThan(0);
		expect(Array.isArray(result.findings)).toBe(true);
	});
});
