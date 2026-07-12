// Type definitions for the unseal package — audit and recovery types for fake PDF redaction detection.

export interface AuditOptions {
	// Tier 1 — fast, default true
	textUnderBox?: boolean;
	incrementalSave?: boolean;
	metadataLeak?: boolean;
	pendingAnnotation?: boolean;
	// Tier 2 — default false
	glyphPositionLeak?: boolean;
	// Tier 3 — expensive, default false
	patternOracle?: boolean;
}

export interface AuditReport {
	/** True if no issues were found across all enabled checks. */
	clean: boolean;
	findings: AuditFinding[];
	/** ISO 8601 timestamp of when the audit was run. */
	checkedAt: string;
	/** SHA-256 hex digest of the input PDF bytes. */
	sha256: string;
}

/** A candidate string produced by the Naccache-Whelan bar-width attack and ranked by the LLM oracle. */
export interface CandidateString {
	text: string;
	/** LLM confidence score 0 to 1. */
	confidence: number;
	/** LLM reasoning for this ranking. */
	reasoning: string;
}

export interface AuditFinding {
	check:
		| 'text-under-box'
		| 'incremental-save'
		| 'metadata-leak'
		| 'pending-annotation'
		| 'glyph-position';
	severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
	/** 1-based page number, if applicable. */
	page?: number;
	/** PDF coordinate bounding box [x1, y1, x2, y2]. */
	bbox?: [number, number, number, number];
	detail: string;
	/** Text recovered from beneath a redaction mark, if available. */
	recoveredText?: string;
	/** LLM-ranked candidate strings for the redacted region (Tier 3 oracle only). */
	candidates?: CandidateString[];
}

export interface UnsealOptions {
	/** Strip filled-rectangle overlays covering text (Scenario A). Default true. */
	stripOverlays?: boolean;
	/** Remove Redact-subtype annotations (Scenario B). Default true. */
	stripAnnotations?: boolean;
	/** Extract the prior revision from an incremental save (Scenario C). Default true. */
	extractPriorRevision?: boolean;
	/** Add sticky-note annotations where content-stream text was removed (Scenario D). Default true. */
	annotateCandidates?: boolean;
	/** Controls what is returned: the modified PDF, a report, or both. Default 'both'. */
	output?: 'pdf' | 'report' | 'both';
	/** Run audit in the same pass and include result in UnsealResult. Default true. */
	includeAudit?: boolean;
	/**
	 * Options forwarded to the inline audit pass (only used when includeAudit is true).
	 * Tier 1 checks are always on by default; use this to enable Tier 2/3:
	 * `{ glyphPositionLeak: true, patternOracle: true }`
	 */
	auditOptions?: AuditOptions;
}

export interface UnsealResult {
	/** Modified PDF bytes — present when output is 'pdf' or 'both'. */
	pdf?: Uint8Array<ArrayBufferLike>;
	findings: UnsealFinding[];
	/** Count of filled-rectangle overlays removed from content streams. */
	overlaysStripped: number;
	/** Count of Redact annotations removed. */
	annotationsRemoved: number;
	/** True if a prior revision was found and extracted. */
	priorRevisionRecovered: boolean;
	/** Full audit report, present when includeAudit is true. */
	auditReport?: AuditReport;
}

export interface UnsealFinding {
	/** Recovery scenario. A=overlay stripped, B=annotation removed, C=prior revision, D=candidate annotated. */
	scenario: 'A' | 'B' | 'C' | 'D';
	/** 1-based page number, if applicable. */
	page?: number;
	/** PDF coordinate bounding box [x1, y1, x2, y2]. */
	bbox?: [number, number, number, number];
	/** Text recovered from beneath the redaction mark. */
	recoveredText?: string;
	/** Confidence score 0–1 that this region contains hidden content. */
	confidence: number;
	/** The prior revision PDF bytes (Scenario C only). */
	priorRevisionPdf?: Uint8Array<ArrayBufferLike>;
}
