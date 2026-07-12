// Glyph-position leak check — detects character spacing anomalies consistent with OCR reconstruction.
// Implements the Bland et al. (2022) attack indicator: when redacted text is replaced via OCR,
// character positioning in TJ arrays no longer matches the original font's advance widths.

import type { AuditFinding } from '../types.js';
import { extractFontBytes } from '../font/extract.js';
import { metricsFromBytes, standardFontMetrics, fallbackFontMetrics } from '../font/metrics.js';
import type { FontMetrics } from '../font/metrics.js';

/** Minimum character count in a text item to run the spacing analysis. */
const MIN_CHARS = 3;

/** Deviation threshold above which width mismatch is flagged (15%). */
const DEVIATION_THRESHOLD = 0.15;

/** Coefficient of variation below which all characters are considered uniform spacing (1%). */
const UNIFORM_CV_THRESHOLD = 0.01;

/**
 * Checks a single PDF page for glyph-position anomalies that suggest fake redaction via
 * OCR reconstruction or uniform-width character placement.
 *
 * Returns AuditFindings for suspicious text items.
 */
export async function checkGlyphPosition(pdf: ArrayBuffer, pageNum: number): Promise<AuditFinding[]> {
	const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');

	const doc = await getDocument({ data: pdf.slice(0) }).promise;
	if (pageNum > doc.numPages) {
		await doc.destroy();
		return [];
	}

	const page = await doc.getPage(pageNum);

	let textContent: Awaited<ReturnType<typeof page.getTextContent>>;
	try {
		textContent = await page.getTextContent();
	} finally {
		page.cleanup();
		await doc.destroy();
	}

	// Cache of font metrics keyed by fontName to avoid redundant extraction.
	const metricsCache = new Map<string, FontMetrics>();

	const findings: AuditFinding[] = [];

	for (const rawItem of textContent.items) {
		const item = rawItem as {
			str: string;
			transform: number[];
			width: number;
			height: number;
			fontName?: string;
		};

		if (!item.str || item.str.length < MIN_CHARS) continue;
		if (!item.str.trim()) continue;

		// Font size is the absolute value of the vertical scale in the text transform matrix.
		const fontSize = Math.abs(item.transform[3] ?? 0);
		if (fontSize < 1) continue;

		// Actual total rendered width of the text item in PDF user-space units.
		const actualWidth = item.width;
		if (!actualWidth || actualWidth <= 0) continue;

		const fontName = item.fontName ?? '';

		// Retrieve (or compute and cache) font metrics for this font.
		let metrics = metricsCache.get(fontName);
		if (!metrics) {
			metrics = await resolveMetrics(pdf, fontName);
			metricsCache.set(fontName, metrics);
		}

		// Compute expected width from font metrics.
		const expectedWidth = metrics.stringWidth(item.str, fontSize);
		if (expectedWidth <= 0) continue;

		// --- Check 1: Overall width deviation ---
		const deviation = Math.abs(actualWidth - expectedWidth) / expectedWidth;
		if (deviation > DEVIATION_THRESHOLD) {
			const tx = item.transform[4] ?? 0;
			const ty = item.transform[5] ?? 0;
			findings.push({
				check: 'glyph-position',
				severity: 'MEDIUM',
				page: pageNum,
				bbox: [tx, ty, tx + actualWidth, ty + (item.height || fontSize)],
				detail:
					`Character spacing deviation of ${(deviation * 100).toFixed(1)}% on page ${pageNum} ` +
					`(actual ${actualWidth.toFixed(1)}pt vs expected ${expectedWidth.toFixed(1)}pt for "${item.str.slice(0, 30)}") ` +
					`— may indicate OCR reconstruction or glyph-position manipulation`,
				recoveredText: item.str,
			});
			continue;
		}

		// --- Check 2: Uniform inter-character spacing ---
		// Compute per-character widths from font metrics and test coefficient of variation.
		if (item.str.length >= MIN_CHARS) {
			const perCharWidths: number[] = [];
			for (const char of item.str) {
				perCharWidths.push(metrics.advanceWidth(char));
			}
			const mean = perCharWidths.reduce((a, b) => a + b, 0) / perCharWidths.length;
			if (mean > 0) {
				const variance =
					perCharWidths.reduce((sum, w) => sum + (w - mean) ** 2, 0) / perCharWidths.length;
				const stdDev = Math.sqrt(variance);
				const cv = stdDev / mean;

				// Uniform spacing detected — suspiciously low coefficient of variation.
				if (cv < UNIFORM_CV_THRESHOLD && item.str.length > MIN_CHARS) {
					const tx = item.transform[4] ?? 0;
					const ty = item.transform[5] ?? 0;
					findings.push({
						check: 'glyph-position',
						severity: 'HIGH',
						page: pageNum,
						bbox: [tx, ty, tx + actualWidth, ty + (item.height || fontSize)],
						detail:
							`Uniform inter-character spacing (CV=${cv.toFixed(4)}) on page ${pageNum} for ` +
							`"${item.str.slice(0, 30)}" — pattern produced by naive redaction tools using average advance width`,
						recoveredText: item.str,
					});
				}
			}
		}
	}

	return findings;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolves FontMetrics for a given PDF font name.
 * Priority: embedded font bytes → standard font table → global fallback.
 */
async function resolveMetrics(pdf: ArrayBuffer, fontName: string): Promise<FontMetrics> {
	// 1. Try to extract embedded font bytes and parse them.
	if (fontName) {
		try {
			const fontBytes = await extractFontBytes(pdf, fontName);
			if (fontBytes) {
				const metrics = await metricsFromBytes(fontBytes);
				return metrics;
			}
		} catch {
			// Log warning but continue — graceful degradation.
			console.warn(`Unseal: failed to extract/parse embedded font "${fontName}", falling back to standard table`);
		}

		// 2. Try standard PDF font table (handles BaseFont names pdfjs exposes).
		const std = standardFontMetrics(fontName);
		if (std) return std;

		// 3. Strip common prefixes (e.g. "g_d0_f1" → check tail for a standard name).
		const basePart = fontName.split('_').pop() ?? fontName;
		const stdBase = standardFontMetrics(basePart);
		if (stdBase) return stdBase;
	}

	// 4. Global fallback.
	return fallbackFontMetrics();
}
