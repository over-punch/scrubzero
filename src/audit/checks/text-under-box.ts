// Check for text hidden beneath filled rectangles — the most common fake redaction technique.

import type { AuditFinding } from '../types.js';

/** A filled rectangle detected in the content stream. */
interface FilledRect {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

/** Checks a single page for text items whose bounding box overlaps filled rectangles in the content stream. */
export async function checkTextUnderBox(
	pdf: ArrayBuffer,
	pageNum: number,
): Promise<AuditFinding[]> {
	const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');

	const doc = await getDocument({ data: pdf.slice(0) }).promise;

	if (pageNum > doc.numPages) {
		await doc.destroy();
		return [];
	}

	const page = await doc.getPage(pageNum);

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

	await doc.destroy();

	// Fill op codes as a plain set of numbers.
	const fillOpCodes = new Set<number>([
		OPS.fill as number,
		OPS.eoFill as number,
		OPS.fillStroke as number,
		OPS.eoFillStroke as number,
		OPS.closeFillStroke as number,
		OPS.closeEOFillStroke as number,
	]);

	const filledRects: FilledRect[] = [];
	let pendingRect: FilledRect | null = null;

	for (let i = 0; i < opList.fnArray.length; i++) {
		const fn = opList.fnArray[i] as number;
		const args = opList.argsArray[i] as unknown[];

		if (fn === (OPS.rectangle as number)) {
			const x = args[0] as number;
			const y = args[1] as number;
			const w = args[2] as number;
			const h = args[3] as number;
			pendingRect = { x1: x, y1: y, x2: x + w, y2: y + h };
		} else if (fn === (OPS.constructPath as number)) {
			const subOps = args[0] as number[];
			const subArgs = args[1] as number[];
			let argIdx = 0;
			for (const subOp of subOps) {
				if (subOp === (OPS.rectangle as number)) {
					const x = subArgs[argIdx] ?? 0;
					const y = subArgs[argIdx + 1] ?? 0;
					const w = subArgs[argIdx + 2] ?? 0;
					const h = subArgs[argIdx + 3] ?? 0;
					pendingRect = { x1: x, y1: y, x2: x + w, y2: y + h };
					argIdx += 4;
				} else if (subOp === (OPS.moveTo as number) || subOp === (OPS.lineTo as number)) {
					argIdx += 2;
				} else if (subOp === (OPS.curveTo as number)) {
					argIdx += 6;
				} else if (subOp === (OPS.curveTo2 as number) || subOp === (OPS.curveTo3 as number)) {
					argIdx += 4;
				}
			}
		} else if (fillOpCodes.has(fn)) {
			if (pendingRect) {
				filledRects.push(pendingRect);
				pendingRect = null;
			}
		} else if (
			fn === (OPS.stroke as number) ||
			fn === (OPS.closeStroke as number) ||
			fn === (OPS.endPath as number)
		) {
			pendingRect = null;
		}
	}

	if (filledRects.length === 0) return [];

	const findings: AuditFinding[] = [];
	const seen = new Set<string>();

	for (const item of textContent.items as Array<{
		str: string;
		transform: number[];
		width: number;
		height: number;
	}>) {
		if (!item.str.trim()) continue;

		const tx = item.transform[4] ?? 0;
		const ty = item.transform[5] ?? 0;
		const tw = item.width;
		const th = item.height || 10;

		const itemLeft = tx;
		const itemBottom = ty;
		const itemRight = tx + tw;
		const itemTop = ty + th;

		for (const rect of filledRects) {
			const rLeft = Math.min(rect.x1, rect.x2);
			const rRight = Math.max(rect.x1, rect.x2);
			const rBottom = Math.min(rect.y1, rect.y2);
			const rTop = Math.max(rect.y1, rect.y2);

			const rectW = rRight - rLeft;
			const rectH = rTop - rBottom;
			if (rectW < 5 || rectH < 5) continue;

			const overlaps =
				itemLeft < rRight - 1 &&
				itemRight > rLeft + 1 &&
				itemBottom < rTop - 1 &&
				itemTop > rBottom + 1;

			if (overlaps) {
				const key = `${pageNum}:${rect.x1.toFixed(1)},${rect.y1.toFixed(1)},${rect.x2.toFixed(1)},${rect.y2.toFixed(1)}`;
				if (seen.has(key)) continue;
				seen.add(key);

				findings.push({
					check: 'text-under-box',
					severity: 'CRITICAL',
					page: pageNum,
					bbox: [rLeft, rBottom, rRight, rTop],
					detail: `Text hidden under filled rectangle on page ${pageNum}`,
					recoveredText: item.str,
				});
				break;
			}
		}
	}

	return findings;
}
