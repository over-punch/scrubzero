// Font metrics helpers — advance width tables for standard PDF fonts and opentype.js-based parsing.

import type opentype from 'opentype.js';

/** Advance width lookup and string width computation for a PDF font. */
export interface FontMetrics {
	/** Advance width for a character, in thousandths of a text unit (same as PDF glyph space). */
	advanceWidth(char: string): number;
	/** Total width of a string in PDF user-space units, given font size in points. */
	stringWidth(str: string, fontSize: number): number;
}

// ---------------------------------------------------------------------------
// Standard PDF font advance-width tables (1/1000 em units).
// Values are taken from the PDF 1.7 specification appendix tables.
// ---------------------------------------------------------------------------

/** Helvetica advance widths keyed by character. All values in 1/1000 em. */
const HELVETICA_WIDTHS: Record<string, number> = {
	' ': 278,
	a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222,
	j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333,
	s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
	A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278,
	J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
	S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
	'0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556,
	'7': 556, '8': 556, '9': 556,
	'.': 278, ',': 278, ':': 278, ';': 278, '-': 333, '/': 278,
	'!': 278, '?': 556, '(': 333, ')': 333, '[': 278, ']': 278, '{': 334,
	'}': 334, '_': 556, '+': 584, '=': 584, '"': 355, "'": 222, '`': 222,
	'@': 1015, '#': 556, '$': 556, '%': 889, '^': 469, '&': 722, '*': 389,
};

/** Courier advance width — monospaced, all characters 600. */
const COURIER_WIDTH = 600;

/** Times Roman advance widths for common characters. */
const TIMES_ROMAN_WIDTHS: Record<string, number> = {
	' ': 250,
	a: 444, b: 500, c: 444, d: 500, e: 444, f: 333, g: 500, h: 500, i: 278,
	j: 278, k: 500, l: 278, m: 778, n: 500, o: 500, p: 500, q: 500, r: 333,
	s: 389, t: 278, u: 500, v: 500, w: 722, x: 500, y: 500, z: 444,
	A: 722, B: 667, C: 667, D: 722, E: 611, F: 556, G: 722, H: 722, I: 333,
	J: 389, K: 722, L: 611, M: 889, N: 722, O: 722, P: 556, Q: 722, R: 667,
	S: 556, T: 611, U: 722, V: 722, W: 944, X: 722, Y: 722, Z: 611,
	'0': 500, '1': 500, '2': 500, '3': 500, '4': 500, '5': 500, '6': 500,
	'7': 500, '8': 500, '9': 500,
	'.': 250, ',': 250, ':': 278, ';': 278, '-': 333, '/': 278,
};

/** Symbol table entry for the 14 standard PDF fonts. */
interface StandardFontEntry {
	/** Per-character width map (1/1000 em). Absence means use defaultWidth. */
	widths: Record<string, number>;
	/** Fallback for characters not in the widths map. */
	defaultWidth: number;
}

/** All 14 standard PDF font families mapped to their metrics. */
const STANDARD_FONTS: Record<string, StandardFontEntry> = {
	Helvetica: { widths: HELVETICA_WIDTHS, defaultWidth: 556 },
	'Helvetica-Bold': { widths: HELVETICA_WIDTHS, defaultWidth: 556 },
	'Helvetica-Oblique': { widths: HELVETICA_WIDTHS, defaultWidth: 556 },
	'Helvetica-BoldOblique': { widths: HELVETICA_WIDTHS, defaultWidth: 556 },
	'Times-Roman': { widths: TIMES_ROMAN_WIDTHS, defaultWidth: 500 },
	'Times-Bold': { widths: TIMES_ROMAN_WIDTHS, defaultWidth: 500 },
	'Times-Italic': { widths: TIMES_ROMAN_WIDTHS, defaultWidth: 500 },
	'Times-BoldItalic': { widths: TIMES_ROMAN_WIDTHS, defaultWidth: 500 },
	Courier: { widths: {}, defaultWidth: COURIER_WIDTH },
	'Courier-Bold': { widths: {}, defaultWidth: COURIER_WIDTH },
	'Courier-Oblique': { widths: {}, defaultWidth: COURIER_WIDTH },
	'Courier-BoldOblique': { widths: {}, defaultWidth: COURIER_WIDTH },
	Symbol: { widths: {}, defaultWidth: 600 },
	ZapfDingbats: { widths: {}, defaultWidth: 600 },
};

/** Global fallback advance width (Helvetica average) when font is unknown. */
const FALLBACK_WIDTH = 556;

/**
 * Returns FontMetrics for a standard PDF font by base name.
 * Returns null if the name is not one of the 14 standard fonts.
 */
export function standardFontMetrics(baseFontName: string): FontMetrics | null {
	// Strip leading slash if present (PDF names sometimes include it).
	const name = baseFontName.startsWith('/') ? baseFontName.slice(1) : baseFontName;
	const entry = STANDARD_FONTS[name];
	if (!entry) return null;

	return makeMetrics((char) => entry.widths[char] ?? entry.defaultWidth);
}

/**
 * Parses raw font bytes with opentype.js and returns FontMetrics.
 * Throws if the bytes cannot be parsed.
 */
export async function metricsFromBytes(fontBytes: Uint8Array): Promise<FontMetrics> {
	const opentypeModule = await import('opentype.js');
	// opentype.js default export is the namespace object.
	const ot = opentypeModule.default as typeof opentype;

	const buffer = fontBytes.buffer.slice(
		fontBytes.byteOffset,
		fontBytes.byteOffset + fontBytes.byteLength,
	) as ArrayBuffer;

	const font = ot.parse(buffer);
	const unitsPerEm: number = font.unitsPerEm || 1000;

	return makeMetrics((char) => {
		const glyph = font.charToGlyph(char);
		if (!glyph) return FALLBACK_WIDTH;
		const aw: number = (glyph.advanceWidth ?? 0);
		// Normalise to 1/1000 em.
		return Math.round((aw / unitsPerEm) * 1000);
	});
}

/** Returns a FontMetrics that falls back to FALLBACK_WIDTH for every character. */
export function fallbackFontMetrics(): FontMetrics {
	return makeMetrics(() => FALLBACK_WIDTH);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Creates a FontMetrics implementation from a per-character advance-width function. */
function makeMetrics(widthFn: (char: string) => number): FontMetrics {
	return {
		advanceWidth(char: string): number {
			return widthFn(char);
		},
		stringWidth(str: string, fontSize: number): number {
			let total = 0;
			for (const char of str) {
				total += widthFn(char);
			}
			return (total / 1000) * fontSize;
		},
	};
}
