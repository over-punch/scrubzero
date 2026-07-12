// Recovery Scenario A: strip filled-rectangle overlays from content streams to expose hidden text.

import type { UnsealFinding } from '../types.js';

/** Result returned by the overlay stripping operation. */
export interface StripOverlaysResult {
	pdf: Uint8Array<ArrayBufferLike>;
	count: number;
	findings: UnsealFinding[];
}

/** A filled rectangle found in the content stream. */
interface FilledRect {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

/** An operator span (range of indices) that should be removed from the stream. */
interface RemovableSpan {
	startIdx: number;
	endIdx: number;
	rect: FilledRect;
	recoveredText: string;
}

/**
 * Scans each page for filled rectangles that overlap text positions and removes
 * those drawing operators from the content stream. Returns the modified PDF
 * and the count of overlays removed.
 */
export async function stripOverlays(pdf: ArrayBuffer): Promise<StripOverlaysResult> {
	const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const { PDFDocument, PDFName } = await import('pdf-lib');

	const pdfLibDoc = await PDFDocument.load(new Uint8Array(pdf));
	const pdfJsDoc = await getDocument({ data: pdf.slice(0) }).promise;

	let totalCount = 0;
	const findings: UnsealFinding[] = [];

	const numPages = pdfJsDoc.numPages;

	// Cast OPS to a plain number index so we can use it in Set and comparisons.
	const ops = OPS as Record<string, number>;

	const fillOpCodes = new Set<number>([
		ops['fill'] ?? 0,
		ops['eoFill'] ?? 0,
		ops['fillStroke'] ?? 0,
		ops['eoFillStroke'] ?? 0,
		ops['closeFillStroke'] ?? 0,
		ops['closeEOFillStroke'] ?? 0,
	]);
	fillOpCodes.delete(0); // Remove placeholder if any key was missing.

	for (let p = 1; p <= numPages; p++) {
		const page = await pdfJsDoc.getPage(p);

		let opList: Awaited<ReturnType<typeof page.getOperatorList>>;
		let textContent: Awaited<ReturnType<typeof page.getTextContent>>;

		try {
			[opList, textContent] = await Promise.all([
				page.getOperatorList(),
				page.getTextContent(),
			]);
		} finally {
			page.cleanup();
		}

		const textBoxes = (
			textContent.items as Array<{ str: string; transform: number[]; width: number; height: number }>
		)
			.filter((i) => i.str.trim())
			.map((i) => ({
				str: i.str,
				left: i.transform[4] ?? 0,
				bottom: i.transform[5] ?? 0,
				right: (i.transform[4] ?? 0) + i.width,
				top: (i.transform[5] ?? 0) + (i.height || 10),
			}));

		if (textBoxes.length === 0) continue;

		const spansToRemove: RemovableSpan[] = [];
		let spanStart = -1;
		let pendingRect: FilledRect | null = null;

		const rectangleOp = ops['rectangle'] ?? -1;
		const constructPathOp = ops['constructPath'] ?? -1;
		const moveTo = ops['moveTo'] ?? -1;
		const lineTo = ops['lineTo'] ?? -1;
		const curveTo = ops['curveTo'] ?? -1;
		const curveTo2 = ops['curveTo2'] ?? -1;
		const curveTo3 = ops['curveTo3'] ?? -1;
		const closePath = ops['closePath'] ?? -1;
		const strokeOp = ops['stroke'] ?? -1;
		const closeStrokeOp = ops['closeStroke'] ?? -1;
		const endPathOp = ops['endPath'] ?? -1;

		for (let i = 0; i < opList.fnArray.length; i++) {
			const fn = opList.fnArray[i] as number;
			const args = opList.argsArray[i] as unknown[];

			if (fn === rectangleOp) {
				const x = args[0] as number;
				const y = args[1] as number;
				const w = args[2] as number;
				const h = args[3] as number;
				pendingRect = { x1: x, y1: y, x2: x + w, y2: y + h };
				if (spanStart === -1) spanStart = i;
			} else if (fn === constructPathOp) {
				const subOps = args[0] as number[];
				const subArgs = args[1] as number[];
				let argIdx = 0;
				for (const subOp of subOps) {
					if (subOp === rectangleOp) {
						const x = subArgs[argIdx] ?? 0;
						const y = subArgs[argIdx + 1] ?? 0;
						const w = subArgs[argIdx + 2] ?? 0;
						const h = subArgs[argIdx + 3] ?? 0;
						pendingRect = { x1: x, y1: y, x2: x + w, y2: y + h };
						argIdx += 4;
					} else if (subOp === moveTo || subOp === lineTo) {
						argIdx += 2;
					} else if (subOp === curveTo) {
						argIdx += 6;
					} else if (subOp === curveTo2 || subOp === curveTo3) {
						argIdx += 4;
					}
				}
				if (spanStart === -1) spanStart = i;
			} else if (fillOpCodes.has(fn) && pendingRect) {
				const rect = pendingRect;
				const rLeft = Math.min(rect.x1, rect.x2);
				const rRight = Math.max(rect.x1, rect.x2);
				const rBottom = Math.min(rect.y1, rect.y2);
				const rTop = Math.max(rect.y1, rect.y2);

				const rectW = rRight - rLeft;
				const rectH = rTop - rBottom;

				if (rectW >= 5 && rectH >= 5) {
					const overlapping = textBoxes.filter(
						(tb) =>
							tb.left < rRight - 1 &&
							tb.right > rLeft + 1 &&
							tb.bottom < rTop - 1 &&
							tb.top > rBottom + 1,
					);

					if (overlapping.length > 0) {
						spansToRemove.push({
							startIdx: spanStart === -1 ? i : spanStart,
							endIdx: i,
							rect,
							recoveredText: overlapping.map((t) => t.str).join(' '),
						});
					}
				}
				spanStart = -1;
				pendingRect = null;
			} else if (fn === strokeOp || fn === closeStrokeOp || fn === endPathOp) {
				spanStart = -1;
				pendingRect = null;
			}
		}

		if (spansToRemove.length === 0) continue;

		// Build the set of operator indices to remove.
		const removeRanges = new Set<number>();
		for (const span of spansToRemove) {
			for (let idx = span.startIdx; idx <= span.endIdx; idx++) {
				removeRanges.add(idx);
			}
		}

		// Re-encode surviving operators into PDF syntax.
		const lines: string[] = [];
		for (let i = 0; i < opList.fnArray.length; i++) {
			if (removeRanges.has(i)) continue;
			const fn = opList.fnArray[i] as number;
			const args = opList.argsArray[i] as unknown[];
			const opStr = encodeOperator(fn, args, ops);
			if (opStr !== null) lines.push(opStr);
		}

		const newContentBytes = new TextEncoder().encode(lines.join('\n') + '\n');

		// Replace the page content stream in pdf-lib.
		const pdfLibPage = pdfLibDoc.getPage(p - 1);
		const contentStreamRef = pdfLibDoc.context.register(
			pdfLibDoc.context.stream(newContentBytes),
		);
		pdfLibPage.node.set(PDFName.of('Contents'), contentStreamRef);

		for (const span of spansToRemove) {
			totalCount++;
			findings.push({
				scenario: 'A',
				page: p,
				bbox: [
					Math.min(span.rect.x1, span.rect.x2),
					Math.min(span.rect.y1, span.rect.y2),
					Math.max(span.rect.x1, span.rect.x2),
					Math.max(span.rect.y1, span.rect.y2),
				],
				recoveredText: span.recoveredText,
				confidence: 0.9,
			});
		}
	}

	await pdfJsDoc.destroy();

	const saved = await pdfLibDoc.save();
	const resultBytes = new Uint8Array(new ArrayBuffer(saved.byteLength));
	resultBytes.set(saved);
	return { pdf: resultBytes, count: totalCount, findings };
}

/**
 * Re-encodes a single PDF.js operator and its args back into PDF content-stream syntax.
 * Returns null for operators that cannot be safely re-encoded.
 */
function encodeOperator(fn: number, args: unknown[], ops: Record<string, number>): string | null {
	// Build keyword map from operator name to PDF keyword.
	// We use a plain Record<string, string> and look up by name to avoid computed property issues.
	const nameToKeyword: Record<string, string> = {
		save: 'q',
		restore: 'Q',
		transform: 'cm',
		moveTo: 'm',
		lineTo: 'l',
		curveTo: 'c',
		curveTo2: 'v',
		curveTo3: 'y',
		closePath: 'h',
		rectangle: 're',
		stroke: 'S',
		closeStroke: 's',
		fill: 'f',
		eoFill: 'f*',
		fillStroke: 'B',
		eoFillStroke: 'B*',
		closeFillStroke: 'b',
		closeEOFillStroke: 'b*',
		endPath: 'n',
		clip: 'W',
		eoClip: 'W*',
		beginText: 'BT',
		endText: 'ET',
		setCharSpacing: 'Tc',
		setWordSpacing: 'Tw',
		setHScale: 'Tz',
		setLeading: 'TL',
		setFont: 'Tf',
		setTextRenderingMode: 'Tr',
		setTextRise: 'Ts',
		moveText: 'Td',
		setLeadingMoveText: 'TD',
		setTextMatrix: 'Tm',
		nextLine: 'T*',
		showText: 'Tj',
		showSpacedText: 'TJ',
		nextLineShowText: "'",
		nextLineSetSpacingShowText: '"',
		setCharWidth: 'd0',
		setCharWidthAndBounds: 'd1',
		setStrokeColorSpace: 'CS',
		setFillColorSpace: 'cs',
		setStrokeColor: 'SC',
		setStrokeColorN: 'SCN',
		setFillColor: 'sc',
		setFillColorN: 'scn',
		setStrokeGray: 'G',
		setFillGray: 'g',
		setStrokeRGBColor: 'RG',
		setFillRGBColor: 'rg',
		setStrokeCMYKColor: 'K',
		setFillCMYKColor: 'k',
		shadingFill: 'sh',
		setLineWidth: 'w',
		setLineCap: 'J',
		setLineJoin: 'j',
		setMiterLimit: 'M',
		setDash: 'd',
		setRenderingIntent: 'ri',
		setFlatness: 'i',
		setGState: 'gs',
		paintImageXObject: 'Do',
		paintFormXObject: 'Do',
		markPoint: 'MP',
		markPointProps: 'DP',
		beginMarkedContent: 'BMC',
		beginMarkedContentProps: 'BDC',
		endMarkedContent: 'EMC',
	};

	// Build a reverse lookup: opCode -> keyword
	const codeToKeyword = new Map<number, string>();
	for (const [name, keyword] of Object.entries(nameToKeyword)) {
		const code = ops[name];
		if (code !== undefined) {
			codeToKeyword.set(code, keyword);
		}
	}

	// Handle constructPath specially — expand into individual sub-ops.
	const constructPathCode = ops['constructPath'];
	if (constructPathCode !== undefined && fn === constructPathCode) {
		const subOps = args[0] as number[];
		const subArgs = args[1] as number[];
		const rectangleCode = ops['rectangle'];
		const moveToCode = ops['moveTo'];
		const lineToCode = ops['lineTo'];
		const curveToCode = ops['curveTo'];
		const closePathCode = ops['closePath'];
		let argIdx = 0;
		const parts: string[] = [];

		for (const subOp of subOps) {
			if (subOp === rectangleCode) {
				const x = subArgs[argIdx] ?? 0;
				const y = subArgs[argIdx + 1] ?? 0;
				const w = subArgs[argIdx + 2] ?? 0;
				const h = subArgs[argIdx + 3] ?? 0;
				parts.push(`${fmtN(x)} ${fmtN(y)} ${fmtN(w)} ${fmtN(h)} re`);
				argIdx += 4;
			} else if (subOp === moveToCode) {
				parts.push(`${fmtN(subArgs[argIdx] ?? 0)} ${fmtN(subArgs[argIdx + 1] ?? 0)} m`);
				argIdx += 2;
			} else if (subOp === lineToCode) {
				parts.push(`${fmtN(subArgs[argIdx] ?? 0)} ${fmtN(subArgs[argIdx + 1] ?? 0)} l`);
				argIdx += 2;
			} else if (subOp === curveToCode) {
				parts.push(
					`${fmtN(subArgs[argIdx] ?? 0)} ${fmtN(subArgs[argIdx + 1] ?? 0)} ${fmtN(subArgs[argIdx + 2] ?? 0)} ${fmtN(subArgs[argIdx + 3] ?? 0)} ${fmtN(subArgs[argIdx + 4] ?? 0)} ${fmtN(subArgs[argIdx + 5] ?? 0)} c`,
				);
				argIdx += 6;
			} else if (subOp === closePathCode) {
				parts.push('h');
			}
		}
		return parts.length > 0 ? parts.join('\n') : null;
	}

	const keyword = codeToKeyword.get(fn);
	if (!keyword) return null;

	const argStrs = Array.isArray(args)
		? args.map((a) => {
				if (typeof a === 'number') return fmtN(a);
				if (typeof a === 'string') return `(${a.replace(/[()\\]/g, (c) => '\\' + c)})`;
				if (Array.isArray(a))
					return `[${(a as unknown[]).map((x) => (typeof x === 'number' ? fmtN(x) : String(x))).join(' ')}]`;
				if (a instanceof Uint8Array) return `<${Buffer.from(a).toString('hex')}>`;
				return String(a);
			})
		: [];

	const argStr = argStrs.join(' ');
	return argStr ? `${argStr} ${keyword}` : keyword;
}

/** Formats a number for PDF content stream output — no scientific notation. */
function fmtN(n: number): string {
	if (Number.isInteger(n)) return String(n);
	return n.toFixed(4).replace(/\.?0+$/, '');
}
