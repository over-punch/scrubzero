// Public API surface for pdf-redact

export { redact } from './redact.js';
export { searchAndRedact, redactWithPHIDetector } from './search-and-redact.js';
export { redactBatch } from './batch.js';
export { redactEntities, EntityPatterns, DEFAULT_FOIA_EXEMPTIONS } from './entity-patterns.js';
export { verify } from './verify.js';

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
