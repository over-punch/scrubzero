// CLI entry point: `npx pdf-redact search <file> <pattern>` and related commands.
// Bundled separately as dist/cli.js with a shebang via tsup.

import { program } from 'commander';
import { readFile, writeFile } from 'fs/promises';
import { redact, searchAndRedact, redactEntities, verify, DEFAULT_FOIA_EXEMPTIONS, audit, unseal, AuditPresets } from './index.js';
import type { EntityType } from './entity-patterns.js';
import type { RedactionRegion, RedactWarning } from './types.js';

/** Print redaction warnings (e.g. bars over scanned/image content) to stderr. */
function printWarnings(warnings: RedactWarning[]): void {
	if (warnings.length === 0) return;
	console.warn(`\n⚠ ${warnings.length} warning(s) — content may still be recoverable:`);
	for (const w of warnings) {
		console.warn(`  [page ${w.page}] ${w.message}`);
	}
}

const pkg = { version: '1.0.0' };

program
	.name('scrubzero')
	.description('PDF redaction toolkit — redact (content-stream), audit/unseal fake redactions, and verify')
	.version(pkg.version);

// ─── search ──────────────────────────────────────────────────────────────────

program
	.command('search <file> <pattern>')
	.description('Find all occurrences of a text or /regex/flags pattern and redact them')
	.option('--output <file>', 'Output PDF file path', 'redacted.pdf')
	.option('--color <hex>', 'Bar color as hex (e.g. #000000)', '#000000')
	.option('--label <text>', 'Label rendered inside the bar (e.g. REDACTED)')
	.option('--exemption <code>', 'Exemption code stamped on the bar and logged (e.g. "(b)(6)")')
	.option('--redactor <id>', 'Operator ID recorded in the manifest')
	.option('--manifest', 'Write a JSON audit manifest (redaction log) alongside the output')
	.option('--json', 'Print a JSON summary instead of human-readable output')
	.action(async (file: string, pattern: string, opts: { output: string; color: string; label?: string; exemption?: string; redactor?: string; manifest?: boolean; json?: boolean }) => {
		let pdfBuffer: Buffer;
		try {
			pdfBuffer = await readFile(file);
		} catch (err) {
			console.error(`Error: Cannot read file "${file}": ${String(err)}`);
			process.exit(1);
		}

		// Accept /pattern/flags notation or plain text.
		let searchPattern: string | RegExp = pattern;
		const regexMatch = /^\/(.+)\/([gimsuy]*)$/.exec(pattern);
		if (regexMatch) {
			try {
				searchPattern = new RegExp(regexMatch[1]!, regexMatch[2] ?? '');
			} catch {
				console.error(`Error: Invalid regex pattern: ${pattern}`);
				process.exit(1);
			}
		}

		const color = hexToRgb(opts.color);

		let result: Awaited<ReturnType<typeof searchAndRedact>>;
		try {
			result = await searchAndRedact(
				pdfBuffer.buffer as ArrayBuffer,
				[{
					pattern: searchPattern,
					color,
					...(opts.label ? { label: opts.label } : {}),
					...(opts.exemption ? { exemptionCode: opts.exemption } : {}),
				}],
				{
					addRedactionMarkers: !!opts.label || !!opts.exemption,
					generateManifest: !!opts.manifest,
					...(opts.redactor ? { redactorId: opts.redactor } : {}),
				},
			);
		} catch (err) {
			console.error(`Error: Redaction failed: ${String(err)}`);
			process.exit(1);
		}

		await writeFile(opts.output, result.pdf);

		let manifestPath: string | undefined;
		if (opts.manifest && result.manifest) {
			manifestPath = opts.output.replace(/\.pdf$/i, '.manifest.json');
			await writeFile(manifestPath, JSON.stringify(result.manifest, null, 2));
		}

		if (opts.json) {
			console.log(JSON.stringify({ redactedCount: result.redactedCount, pagesAffected: result.pagesAffected, warnings: result.warnings, output: opts.output, manifest: manifestPath }, null, 2));
		} else {
			console.log(`Redacted ${result.redactedCount} region(s) across ${result.pagesAffected.length} page(s)`);
			console.log(`Wrote: ${opts.output}`);
			if (manifestPath) console.log(`Wrote manifest: ${manifestPath}`);
			printWarnings(result.warnings);
		}
	});

// ─── entities ────────────────────────────────────────────────────────────────

const ENTITY_NAMES: EntityType[] = [
	'ssn', 'phone', 'email', 'credit-card', 'ip-address', 'date', 'name', 'attorney-client-marker',
];

program
	.command('entities <file>')
	.description(`Redact common entity types. Available: ${ENTITY_NAMES.join(', ')}`)
	.option('--types <list>', 'Comma-separated entity types to redact (default: all)')
	.option('--output <file>', 'Output PDF file path', 'redacted.pdf')
	.option('--foia', 'Stamp default FOIA exemption codes ((b)(6) for PII, (b)(5) for privilege) and log them')
	.option('--redactor <id>', 'Operator ID recorded in the manifest')
	.option('--manifest', 'Write a JSON audit manifest (redaction log) alongside the output')
	.option('--json', 'Print a JSON summary instead of human-readable output')
	.action(async (file: string, opts: { types?: string; output: string; foia?: boolean; redactor?: string; manifest?: boolean; json?: boolean }) => {
		let pdfBuffer: Buffer;
		try {
			pdfBuffer = await readFile(file);
		} catch (err) {
			console.error(`Error: Cannot read file "${file}": ${String(err)}`);
			process.exit(1);
		}

		let types: EntityType[] = ENTITY_NAMES;
		if (opts.types) {
			const requested = opts.types.split(',').map(s => s.trim().toLowerCase()) as EntityType[];
			const invalid = requested.filter(t => !ENTITY_NAMES.includes(t));
			if (invalid.length > 0) {
				console.error(`Error: Unknown entity types: ${invalid.join(', ')}`);
				console.error(`Available: ${ENTITY_NAMES.join(', ')}`);
				process.exit(1);
			}
			types = requested;
		}

		// With --foia, stamp + log each type's default exemption code.
		const exemptions = opts.foia
			? Object.fromEntries(types.map((t) => [t, DEFAULT_FOIA_EXEMPTIONS[t].code]))
			: undefined;

		let result: Awaited<ReturnType<typeof redactEntities>>;
		try {
			result = await redactEntities(
				pdfBuffer.buffer as ArrayBuffer,
				types,
				{
					addRedactionMarkers: !!opts.foia,
					generateManifest: !!opts.manifest,
					...(opts.redactor ? { redactorId: opts.redactor } : {}),
				},
				exemptions,
			);
		} catch (err) {
			console.error(`Error: Redaction failed: ${String(err)}`);
			process.exit(1);
		}

		await writeFile(opts.output, result.pdf);

		let manifestPath: string | undefined;
		if (opts.manifest && result.manifest) {
			manifestPath = opts.output.replace(/\.pdf$/i, '.manifest.json');
			await writeFile(manifestPath, JSON.stringify(result.manifest, null, 2));
		}

		if (opts.json) {
			console.log(JSON.stringify({ redactedCount: result.redactedCount, pagesAffected: result.pagesAffected, warnings: result.warnings, output: opts.output, manifest: manifestPath }, null, 2));
		} else {
			console.log(`Redacted ${result.redactedCount} entity match(es) across ${result.pagesAffected.length} page(s)`);
			console.log(`Types: ${types.join(', ')}`);
			console.log(`Wrote: ${opts.output}`);
			if (manifestPath) console.log(`Wrote manifest: ${manifestPath}`);
			printWarnings(result.warnings);
		}
	});

// ─── verify ──────────────────────────────────────────────────────────────────

program
	.command('verify <file>')
	.description('Verify that no recoverable text underlies redacted regions')
	.option('--json', 'Output result as JSON')
	.action(async (file: string, opts: { json?: boolean }) => {
		let pdfBuffer: Buffer;
		try {
			pdfBuffer = await readFile(file);
		} catch (err) {
			console.error(`Error: Cannot read file "${file}": ${String(err)}`);
			process.exit(1);
		}

		let result: Awaited<ReturnType<typeof verify>>;
		try {
			result = await verify(pdfBuffer.buffer as ArrayBuffer);
		} catch (err) {
			console.error(`Error: Verification failed: ${String(err)}`);
			process.exit(1);
		}

		if (opts.json) {
			console.log(JSON.stringify(result, null, 2));
			// Not verifiable (warnings) is a failure too, for scripting/CI use.
			process.exit(result.clean && result.warnings.length === 0 ? 0 : 1);
		}

		if (result.clean) {
			console.log('✓ Verification passed — no recoverable text detected under redacted regions');
		} else {
			console.log(`✗ Verification failed — ${result.violations.length} violation(s) found`);
			for (const v of result.violations) {
				const pageStr = v.page ? ` [page ${v.page}]` : '';
				console.log(`  ${pageStr} recovered: "${v.recoveredText.slice(0, 80)}"`);
			}
		}

		// Warnings apply whether or not the text check passed — a scanned page can
		// pass the text check while its image content is still fully recoverable.
		if (result.warnings.length > 0) {
			console.log(`\n⚠ ${result.warnings.length} warning(s) — the text check cannot see image content:`);
			for (const w of result.warnings) {
				console.log(`  [page ${w.page}] ${w.message}`);
			}
			console.log('\nThis PDF is NOT verifiably clean. Check the flagged pages manually.');
		}

		// Exit non-zero if the document is either dirty or not verifiable.
		if (!result.clean || result.warnings.length > 0) process.exit(1);
	});

// ─── redact (coordinate-based) ───────────────────────────────────────────────

program
	.command('redact <file> <regions-json>')
	.description('Redact specific coordinate regions. regions-json is a JSON array or path to a JSON file')
	.option('--output <file>', 'Output PDF file path', 'redacted.pdf')
	.option('--manifest', 'Generate a JSON audit manifest alongside the output')
	.option('--json', 'Print a JSON summary instead of human-readable output')
	.action(async (file: string, regionsArg: string, opts: { output: string; manifest?: boolean; json?: boolean }) => {
		let pdfBuffer: Buffer;
		try {
			pdfBuffer = await readFile(file);
		} catch (err) {
			console.error(`Error: Cannot read file "${file}": ${String(err)}`);
			process.exit(1);
		}

		// regionsArg may be a JSON file path or an inline JSON array.
		let regions: unknown;
		try {
			regions = JSON.parse(regionsArg);
		} catch {
			try {
				const raw = await readFile(regionsArg, 'utf8');
				regions = JSON.parse(raw);
			} catch {
				console.error('Error: regions-json must be a JSON array or a path to a JSON file');
				process.exit(1);
			}
		}

		if (!Array.isArray(regions)) {
			console.error('Error: regions must be a JSON array');
			process.exit(1);
		}

		let result: Awaited<ReturnType<typeof redact>>;
		try {
			result = await redact(
				pdfBuffer.buffer as ArrayBuffer,
				regions as RedactionRegion[],
				...(opts.manifest ? [{ generateManifest: true as const }] : []),
			);
		} catch (err) {
			console.error(`Error: Redaction failed: ${String(err)}`);
			process.exit(1);
		}

		await writeFile(opts.output, result.pdf);

		if (opts.manifest && result.manifest) {
			const manifestPath = opts.output.replace(/\.pdf$/i, '.manifest.json');
			await writeFile(manifestPath, JSON.stringify(result.manifest, null, 2));
			console.log(`Wrote manifest: ${manifestPath}`);
		}

		if (opts.json) {
			console.log(JSON.stringify({ redactedCount: result.redactedCount, pagesAffected: result.pagesAffected, warnings: result.warnings, output: opts.output }, null, 2));
		} else {
			console.log(`Redacted ${result.redactedCount} region(s) across ${result.pagesAffected.length} page(s)`);
			console.log(`Wrote: ${opts.output}`);
			printWarnings(result.warnings);
		}
	});

// ─── helpers ─────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
	const clean = hex.replace('#', '');
	const n = parseInt(clean, 16);
	if (isNaN(n) || clean.length !== 6) return [0, 0, 0];
	return [(n >> 16 & 0xff) / 255, (n >> 8 & 0xff) / 255, (n & 0xff) / 255];
}

// ─── audit (folded from unseal) ──────────────────────────────────────────────

program
	.command('audit <file>')
	.description('Audit a PDF for fake or insecure redactions (text under boxes, revisions, leaks)')
	.option('--preset <preset>', 'Preset: quick | compliance | forensic', 'quick')
	.option('--json', 'Output results as JSON')
	.action(async (file: string, opts: { preset: string; json?: boolean }) => {
		let pdfBuffer: Buffer;
		try {
			pdfBuffer = await readFile(file);
		} catch (err) {
			console.error(`Error: Cannot read file "${file}": ${String(err)}`);
			process.exit(1);
		}

		const options = AuditPresets[opts.preset as keyof typeof AuditPresets] ?? AuditPresets.quick;

		let report: Awaited<ReturnType<typeof audit>>;
		try {
			report = await audit(pdfBuffer.buffer as ArrayBuffer, options);
		} catch (err) {
			console.error(`Error: Failed to audit PDF: ${String(err)}`);
			process.exit(1);
		}

		if (opts.json) {
			console.log(JSON.stringify(report, null, 2));
			process.exit(report.clean ? 0 : 1);
		}

		if (report.clean) {
			console.log(`✓ No issues found (SHA-256: ${report.sha256.slice(0, 16)}…)`);
		} else {
			console.log(`✗ ${report.findings.length} issue(s) found (SHA-256: ${report.sha256.slice(0, 16)}…)`);
			for (const f of report.findings) {
				const pageStr = f.page ? ` [page ${f.page}]` : '';
				const recoveredStr = f.recoveredText ? ` → "${f.recoveredText.slice(0, 60)}"` : '';
				console.log(`  [${f.severity}]${pageStr} ${f.check}: ${f.detail}${recoveredStr}`);
			}
			process.exit(1);
		}
	});

// ─── strip (folded from unseal) ──────────────────────────────────────────────

program
	.command('strip <file>')
	.description('Strip fake redactions and write a usable PDF (reveals what was hidden)')
	.option('--output <file>', 'Output PDF file path', 'unsealed.pdf')
	.option('--report <file>', 'Write a JSON findings report to this file')
	.option('--no-audit', 'Skip the built-in audit pass')
	.action(async (file: string, opts: { output: string; report?: string; audit: boolean }) => {
		let pdfBuffer: Buffer;
		try {
			pdfBuffer = await readFile(file);
		} catch (err) {
			console.error(`Error: Cannot read file "${file}": ${String(err)}`);
			process.exit(1);
		}

		let result: Awaited<ReturnType<typeof unseal>>;
		try {
			result = await unseal(pdfBuffer.buffer as ArrayBuffer, { output: 'both', includeAudit: opts.audit !== false });
		} catch (err) {
			console.error(`Error: Failed to process PDF: ${String(err)}`);
			process.exit(1);
		}

		if (result.pdf) {
			await writeFile(opts.output, result.pdf);
			console.log(`Wrote unsealed PDF to: ${opts.output}`);
		}
		console.log(`Stripped: ${result.overlaysStripped} overlay(s), ${result.annotationsRemoved} annotation(s)`);
		if (result.priorRevisionRecovered) console.log('Prior revision recovered — see findings report for details');

		for (const f of result.findings) {
			const pageStr = f.page ? ` [page ${f.page}]` : '';
			const recoveredStr = f.recoveredText ? ` → "${f.recoveredText.slice(0, 60)}"` : '';
			console.log(`  [Scenario ${f.scenario}]${pageStr} confidence=${(f.confidence * 100).toFixed(0)}%${recoveredStr}`);
		}

		if (opts.report) {
			const reportData = {
				findings: result.findings.map((f) => ({
					...f,
					priorRevisionPdf: f.priorRevisionPdf ? `<${f.priorRevisionPdf.length} bytes>` : undefined,
				})),
				overlaysStripped: result.overlaysStripped,
				annotationsRemoved: result.annotationsRemoved,
				priorRevisionRecovered: result.priorRevisionRecovered,
				auditReport: result.auditReport,
			};
			await writeFile(opts.report, JSON.stringify(reportData, null, 2));
			console.log(`Wrote findings report to: ${opts.report}`);
		}
	});

program.parseAsync(process.argv).catch((err) => {
	console.error(String(err));
	process.exit(1);
});
