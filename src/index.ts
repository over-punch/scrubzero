// Public API surface for scrubzero — the PDF redaction toolkit.
// Redaction (make content gone) + audit/unseal (prove it isn't, or recover it).

export { redact } from './redact.js';
export { searchAndRedact, redactWithPHIDetector } from './search-and-redact.js';
export { redactBatch } from './batch.js';
export { redactEntities, EntityPatterns, DEFAULT_FOIA_EXEMPTIONS } from './entity-patterns.js';
export { verify } from './verify.js';

// Audit side (folded in from the former @liiift-studio/unseal): detect fake
// redaction (text under boxes, incremental-save revisions, metadata/annotation
// leaks, glyph-position leaks) and lift fake bars to reveal what they hid.
export { audit } from './audit/audit.js';
export { unseal } from './audit/unseal.js';
export { AuditPresets } from './audit/presets.js';

export type {
	RedactionRegion,
	SearchPattern,
	RedactOptions,
	RedactResult,
	RedactWarning,
	RedactionManifest,
	RedactionEntry,
	NormalizedRegion,
	TextItem,
} from './types.js';

export type { BatchItem, BatchResult } from './batch.js';

export type { EntityType, EntityPattern } from './entity-patterns.js';

export type { VerificationResult, VerificationViolation, VerificationWarning } from './verify.js';

export type {
	AuditOptions,
	AuditReport,
	AuditFinding,
	UnsealOptions,
	UnsealResult,
	UnsealFinding,
} from './audit/types.js';
