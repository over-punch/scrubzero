// All public TypeScript types and interfaces for pdf-redact

/**
 * A rectangular region on a PDF page to be redacted.
 * Coordinates are in PDF user-space units (points), measured from the top-left of the page.
 */
export interface RedactionRegion {
	/** 1-indexed page number */
	page: number;
	/** X coordinate of the left edge of the region (PDF units from page left) */
	x: number;
	/** Y coordinate of the top edge of the region (PDF units from page top) */
	y: number;
	/** Width of the region in PDF units */
	width: number;
	/** Height of the region in PDF units */
	height: number;
	/** RGB fill color for the redaction bar, each channel 0–1. Default: [0, 0, 0] (black) */
	color?: [number, number, number];
	/** Optional label rendered inside the redaction bar when addRedactionMarkers is true */
	label?: string;
	/** FOIA exemption code (e.g., "6" for personal privacy, "7(C)" for law enforcement) */
	exemptionCode?: string;
	/** Human-readable basis for the exemption */
	exemptionBasis?: string;
}

/**
 * A text search pattern used to locate and redact matching content across a PDF.
 */
export interface SearchPattern {
	/** RegExp or literal string to match against extracted text */
	pattern: RegExp | string;
	/** Limit the search to specific 1-indexed page numbers. Default: all pages */
	pages?: number[];
	/** RGB fill color for matched redaction bars, each channel 0–1. Default: [0, 0, 0] */
	color?: [number, number, number];
	/** Optional label for redaction markers */
	label?: string;
	/**
	 * Exemption code stamped on each matched bar (when addRedactionMarkers is on)
	 * and recorded per-match in the audit manifest — e.g. a FOIA code like "(b)(6)".
	 */
	exemptionCode?: string;
	/** Human-readable basis for the exemption, recorded in the manifest */
	exemptionBasis?: string;
	/**
	 * PHI detector hook: receives text items with their PDF coordinates and returns
	 * bounding boxes of detected PHI regions in the same coordinate space (bottom-left
	 * PDF origin). Integrates with AWS Comprehend Medical, Azure Text Analytics, or
	 * custom NER models.
	 */
	phiDetector?: (
		items: Array<{ str: string; x: number; y: number; width: number; height: number }>,
		pageNum: number,
	) => Promise<Array<{ x: number; y: number; width: number; height: number }>>;
}

/**
 * Options that control redaction behavior.
 */
export interface RedactOptions {
	/** Flatten existing annotations before redacting. Default: true */
	flattenAnnotations?: boolean;
	/** Wipe DocInfo dictionary and XMP metadata stream. Default: true */
	sanitizeMetadata?: boolean;
	/** Render a visible "REDACTED" label inside each redaction bar. Default: false */
	addRedactionMarkers?: boolean;
	/** Include a structured redaction manifest in the result. Default: false */
	generateManifest?: boolean;
	/** Identifies the operator who performed the redaction (for audit logs) */
	redactorId?: string;
	/** Reason code for the redaction (e.g., FOIA exemption code) */
	basisCode?: string;
}

/**
 * A single entry in the redaction audit manifest, recording one redacted region.
 */
export interface RedactionEntry {
	/** 1-indexed page number */
	page: number;
	/** Bounding box [x1, y1, x2, y2] in PDF user-space units (bottom-left origin) */
	bbox: [number, number, number, number];
	/** FOIA or other exemption code for this specific redaction, if provided */
	basisCode: string | undefined;
	/** Human-readable basis for the exemption, if provided */
	basisText?: string | undefined;
	/** Label rendered on the bar (exemption code or custom), if any */
	label?: string | undefined;
	/** Operator who performed the redaction, if provided */
	redactorId: string | undefined;
	/** ISO 8601 timestamp of when the redaction was applied */
	timestamp: string;
	/** SHA-256 hex digest of the original (pre-redaction) PDF bytes */
	sha256Before: string;
	/** SHA-256 hex digest of the redacted output PDF bytes (populated after save) */
	sha256After: string;
}

/**
 * Structured audit manifest attached to a redaction result when generateManifest is true.
 */
export interface RedactionManifest {
	/** ISO 8601 timestamp of when the manifest was created */
	createdAt: string;
	/** Operator who performed the redaction, if provided */
	redactorId: string | undefined;
	/** One entry per redacted region */
	entries: RedactionEntry[];
	/** SHA-256 hex digest of the input PDF bytes */
	sha256Input: string;
	/** SHA-256 hex digest of the output PDF bytes */
	sha256Output: string;
}

/**
 * A non-fatal caution raised during redaction. The most important case is a
 * region drawn over content that has no removable text underneath — a scanned
 * page or an image/vector graphic. There, the bar only *covers* the content
 * visually; the original pixels remain in the file and are fully recoverable.
 */
export interface RedactWarning {
	/** Machine-readable warning kind */
	type: 'visual-only-region' | 'scanned-page';
	/** 1-indexed page number the warning applies to */
	page: number;
	/** Human-readable explanation, safe to surface directly to a user */
	message: string;
}

/**
 * The result returned by redact() and searchAndRedact().
 */
export interface RedactResult {
	/** The redacted PDF as a Uint8Array ready to write to disk or stream */
	pdf: Uint8Array;
	/** Total number of regions that were redacted */
	redactedCount: number;
	/** Sorted list of 1-indexed page numbers that had at least one redaction */
	pagesAffected: number[];
	/**
	 * Cautions where a redaction bar was drawn but no underlying text was
	 * removed (image/scanned/vector content stays recoverable). Empty when every
	 * redacted region had text that was scrubbed from the content stream.
	 */
	warnings: RedactWarning[];
	/** Structured redaction manifest for audit and compliance purposes */
	manifest?: RedactionManifest;
}

/**
 * Internal representation of a region after coordinate normalisation.
 * All values are in PDF user-space points with origin at the bottom-left (PDF convention).
 */
export interface NormalizedRegion {
	page: number;
	/** Left edge of the region (PDF origin bottom-left) */
	xMin: number;
	/** Bottom edge of the region (PDF origin bottom-left) */
	yMin: number;
	/** Right edge of the region */
	xMax: number;
	/** Top edge of the region */
	yMax: number;
	color: [number, number, number];
	label: string | undefined;
	/** FOIA exemption code carried through from the source region */
	exemptionCode: string | undefined;
	/** Human-readable basis for the exemption, carried through for the manifest */
	exemptionBasis: string | undefined;
}

/**
 * A single extracted text item from pdfjs-dist, normalised for internal use.
 */
export interface TextItem {
	/** The text string */
	str: string;
	/** 1-indexed page number */
	page: number;
	/** Left edge in PDF user-space (bottom-left origin) */
	x: number;
	/** Bottom edge in PDF user-space (bottom-left origin) */
	y: number;
	/** Width in PDF user-space units */
	width: number;
	/** Height in PDF user-space units */
	height: number;
}
