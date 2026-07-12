// Recovery Scenario D: add sticky-note annotations to regions where overlays were stripped.

import type { UnsealFinding } from '../types.js';

/** Result of the candidate annotation pass. */
export interface AnnotateCandidatesResult {
	pdf: Uint8Array<ArrayBufferLike>;
	findings: UnsealFinding[];
}

/**
 * Adds a sticky-note (Text) annotation to each region where a Scenario A overlay was stripped.
 * This helps reviewers identify where content was recovered.
 */
export async function annotateStrippedRegions(
	pdf: ArrayBuffer,
	scenarioAFindings: UnsealFinding[],
): Promise<AnnotateCandidatesResult> {
	const { PDFDocument, PDFName, PDFString, rgb } = await import('pdf-lib');

	const pdfLibDoc = await PDFDocument.load(new Uint8Array(pdf));
	const findings: UnsealFinding[] = [];

	for (const finding of scenarioAFindings) {
		if (!finding.page || !finding.bbox) continue;

		const page = pdfLibDoc.getPage(finding.page - 1);
		if (!page) continue;

		const [x1, y1, x2, y2] = finding.bbox;

		// Draw a green highlight rectangle over the region.
		page.drawRectangle({
			x: x1,
			y: y1,
			width: x2 - x1,
			height: y2 - y1,
			borderColor: rgb(0, 0.7, 0),
			borderWidth: 1.5,
			opacity: 0,
			borderOpacity: 0.8,
		});

		// Add a Text (sticky-note) annotation pointing to the region.
		const noteX = x2 + 5;
		const noteY = (y1 + y2) / 2;

		const content = finding.recoveredText
			? `[unseal] Recovered text: "${finding.recoveredText}"`
			: '[unseal] Redaction overlay removed — possible hidden content';

		// Build the annotation dictionary manually.
		const annotDict = pdfLibDoc.context.obj({
			Type: PDFName.of('Annot'),
			Subtype: PDFName.of('Text'),
			Rect: [noteX, noteY, noteX + 18, noteY + 18],
			Contents: PDFString.of(content),
			Name: PDFName.of('Note'),
			C: [0, 0.7, 0],
			Open: false,
		});

		const annotRef = pdfLibDoc.context.register(annotDict);

		// Append to the page's Annots array.
		const annots = page.node.Annots();
		if (annots && 'push' in annots) {
			(annots as { push: (ref: unknown) => void }).push(annotRef);
		} else {
			page.node.set(PDFName.of('Annots'), pdfLibDoc.context.obj([annotRef]));
		}

		const dfinding: UnsealFinding = {
			scenario: 'D',
			page: finding.page,
			bbox: finding.bbox,
			confidence: 0.85,
		};
		if (finding.recoveredText !== undefined) {
			dfinding.recoveredText = finding.recoveredText;
		}
		findings.push(dfinding);
	}

	const saved = await pdfLibDoc.save();
	// Copy into a plain ArrayBuffer-backed Uint8Array so callers get a stable type.
	const resultBytes = new Uint8Array(new ArrayBuffer(saved.byteLength));
	resultBytes.set(saved);
	return { pdf: resultBytes, findings };
}
