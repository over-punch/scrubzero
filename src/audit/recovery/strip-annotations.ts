// Recovery Scenario B: remove Redact-subtype annotations from the PDF annotation layer.

import type { UnsealFinding } from '../types.js';

/** Result returned by the annotation stripping operation. */
export interface StripAnnotationsResult {
	pdf: Uint8Array<ArrayBufferLike>;
	count: number;
	findings: UnsealFinding[];
}

/**
 * Removes all Redact-subtype annotations from every page of the PDF using pdf-lib.
 * Unapplied redaction marks are identified by /Subtype /Redact in the annotation dictionary.
 */
export async function stripAnnotations(pdf: ArrayBuffer): Promise<StripAnnotationsResult> {
	const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const { PDFDocument, PDFName } = await import('pdf-lib');

	// Scan with pdfjs first to find which pages have Redact annotations.
	const pdfJsDoc = await getDocument({ data: pdf.slice(0) }).promise;
	const numPages = pdfJsDoc.numPages;

	interface RedactInfo {
		pageIndex: number;
		rect: [number, number, number, number];
	}
	const redactInfos: RedactInfo[] = [];

	for (let p = 1; p <= numPages; p++) {
		const page = await pdfJsDoc.getPage(p);
		let annotations: Array<{ subtype: string; rect: [number, number, number, number] }>;
		try {
			annotations = (await page.getAnnotations()) as Array<{
				subtype: string;
				rect: [number, number, number, number];
			}>;
		} finally {
			page.cleanup();
		}

		for (const ann of annotations) {
			if (ann.subtype === 'Redact') {
				redactInfos.push({ pageIndex: p - 1, rect: ann.rect });
			}
		}
	}

	await pdfJsDoc.destroy();

	if (redactInfos.length === 0) {
		return {
			pdf: new Uint8Array(pdf),
			count: 0,
			findings: [],
		};
	}

	// Use pdf-lib to remove the Redact annotation dictionaries.
	const pdfLibDoc = await PDFDocument.load(new Uint8Array(pdf));
	const pages = pdfLibDoc.getPages();

	let removed = 0;
	const findings: UnsealFinding[] = [];

	for (const { pageIndex, rect } of redactInfos) {
		const pdfLibPage = pages[pageIndex];
		if (!pdfLibPage) continue;

		// Access the raw Annots array from the page node.
		// pdf-lib exposes this as a PDFArray-like object through the node API.
		const rawNode = pdfLibPage.node as unknown as Record<string, unknown>;
		const annotsFn = rawNode['Annots'];
		if (typeof annotsFn !== 'function') continue;

		const annotsRaw = (annotsFn as () => unknown).call(rawNode);
		if (!annotsRaw || typeof annotsRaw !== 'object') continue;

		// annotsRaw is a PDFArray instance — use its size() and get() methods.
		const annotsArr = annotsRaw as {
			size: () => number;
			get: (i: number) => unknown;
		};

		// pdf-lib's context.obj accepts a LiteralArray — cast through unknown to satisfy strict types.
		const newAnnotRefs: object[] = [];
		let pageRemoved = 0;

		for (let i = 0; i < annotsArr.size(); i++) {
			const annotRef = annotsArr.get(i);
			let isRedact = false;

			try {
				const resolved = pdfLibDoc.context.lookup(
					annotRef as Parameters<typeof pdfLibDoc.context.lookup>[0],
				);

				if (resolved && typeof resolved === 'object' && 'get' in resolved) {
					const dictGet = (resolved as { get: (k: unknown) => unknown }).get;
					const subtype = dictGet.call(resolved, PDFName.of('Subtype'));
					if (subtype === PDFName.of('Redact') || String(subtype) === '/Redact') {
						isRedact = true;
					}
				}
			} catch {
				// Cannot resolve — keep it.
			}

			if (isRedact) {
				pageRemoved++;
			} else {
				newAnnotRefs.push(annotRef as object);
			}
		}

		if (pageRemoved > 0) {
			pdfLibPage.node.set(
				PDFName.of('Annots'),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				pdfLibDoc.context.obj(newAnnotRefs as any),
			);
			removed += pageRemoved;
			findings.push({
				scenario: 'B',
				page: pageIndex + 1,
				bbox: rect,
				confidence: 1.0,
			});
		}
	}

	const saved = await pdfLibDoc.save();
	const resultBytes = new Uint8Array(new ArrayBuffer(saved.byteLength));
	resultBytes.set(saved);
	return { pdf: resultBytes, count: removed, findings };
}
