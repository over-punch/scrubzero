// Preset AuditOptions configurations for quick, compliance, and forensic audit levels.

import type { AuditOptions } from './types.js';

export const AuditPresets: {
	quick: AuditOptions;
	compliance: AuditOptions;
	forensic: AuditOptions;
} = {
	/** Quick preset — Tier 1 checks only, under 100ms on most PDFs. */
	quick: {
		textUnderBox: true,
		incrementalSave: true,
		metadataLeak: true,
		pendingAnnotation: true,
		glyphPositionLeak: false,
		patternOracle: false,
	},

	/** Compliance preset — Tier 1 checks plus glyph-position analysis. */
	compliance: {
		textUnderBox: true,
		incrementalSave: true,
		metadataLeak: true,
		pendingAnnotation: true,
		glyphPositionLeak: true,
		patternOracle: false,
	},

	/** Forensic preset — all deterministic checks enabled (glyph-position included). */
	forensic: {
		textUnderBox: true,
		incrementalSave: true,
		metadataLeak: true,
		pendingAnnotation: true,
		glyphPositionLeak: true,
		patternOracle: false,
	},
};
