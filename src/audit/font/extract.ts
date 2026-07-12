// Font extraction helpers — pulls raw font bytes out of a PDF via pdf-lib for opentype.js parsing.

import { PDFDocument, PDFName, PDFStream, PDFDict, PDFRawStream } from 'pdf-lib';
import { inflateSync } from 'node:zlib';

/**
 * Extracts the raw (decompressed) font bytes for the given font resource name from a PDF.
 * Searches all pages for a /Font dictionary entry matching fontName.
 * Returns null if the font is not embedded or cannot be extracted.
 *
 * @param pdf - The PDF as an ArrayBuffer.
 * @param fontName - The PDF resource name (e.g. "F1") to look up.
 */
export async function extractFontBytes(pdf: ArrayBuffer, fontName: string): Promise<Uint8Array | null> {
	try {
		const pdfDoc = await PDFDocument.load(new Uint8Array(pdf), { ignoreEncryption: true });
		const pages = pdfDoc.getPages();

		for (const page of pages) {
			const node = page.node;

			// Resolve /Resources dictionary.
			let resources: PDFDict | null = null;
			try {
				const rawRes = node.lookup(PDFName.of('Resources'));
				if (rawRes instanceof PDFDict) {
					resources = rawRes;
				}
			} catch {
				continue;
			}
			if (!resources) continue;

			// Resolve /Font dictionary.
			let fontDict: PDFDict | null = null;
			try {
				const rawFont = resources.lookup(PDFName.of('Font'));
				if (rawFont instanceof PDFDict) {
					fontDict = rawFont;
				}
			} catch {
				continue;
			}
			if (!fontDict) continue;

			// Look for our font by name.
			let fontRef: unknown;
			try {
				fontRef = fontDict.lookup(PDFName.of(fontName));
			} catch {
				continue;
			}
			if (!(fontRef instanceof PDFDict)) continue;

			// Dig into /FontDescriptor.
			let descriptor: PDFDict | null = null;
			try {
				const rawDesc = fontRef.lookup(PDFName.of('FontDescriptor'));
				if (rawDesc instanceof PDFDict) {
					descriptor = rawDesc;
				}
			} catch {
				// No descriptor — may be a Type1 or standard font.
			}
			if (!descriptor) continue;

			// Try /FontFile2 (TrueType), then /FontFile3 (CFF/Type1C), then /FontFile.
			const candidates = ['FontFile2', 'FontFile3', 'FontFile'] as const;
			for (const key of candidates) {
				let streamObj: unknown;
				try {
					streamObj = descriptor.lookup(PDFName.of(key));
				} catch {
					continue;
				}

				const stream = streamObj instanceof PDFRawStream
					? streamObj
					: (streamObj instanceof PDFStream ? streamObj : null);

				if (!stream) continue;

				try {
					const bytes = await decompressStream(stream);
					if (bytes && bytes.length > 0) return bytes;
				} catch {
					continue;
				}
			}
		}

		return null;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Reads the raw bytes from a PDFStream / PDFRawStream and decompresses
 * them if /FlateDecode is listed in the /Filter array.
 */
async function decompressStream(stream: PDFStream | PDFRawStream): Promise<Uint8Array | null> {
	let rawBytes: Uint8Array;
	if (stream instanceof PDFRawStream) {
		rawBytes = stream.contents;
	} else {
		return null;
	}

	// Check /Filter entry on the stream dictionary.
	const dict = stream.dict;
	let filterName: string | null = null;
	try {
		const filter = dict.lookup(PDFName.of('Filter'));
		if (filter instanceof PDFName) {
			filterName = filter.asString();
		}
	} catch {
		// No filter — raw bytes are the font data.
	}

	if (filterName === '/FlateDecode' || filterName === 'FlateDecode') {
		try {
			return inflateSync(rawBytes);
		} catch {
			return null;
		}
	}

	// No compression (or unrecognised filter) — return raw.
	return rawBytes;
}
