// CLI entry point: `npx pdf-redact search <file> <pattern>` and related commands.
// Bundled separately as dist/cli.js with a shebang via tsup.

import { program } from 'commander';
import { readFile, writeFile } from 'fs/promises';
import { redact, searchAndRedact, redactEntities, verify } from './index.js';
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

const pkg = { version: '0.2.0' };

program
	.name('pdf-redact')
	.description('True PDF content-stream redaction — removes text before drawing the bar')
	.version(pkg.version);

// ─── search ──────────────────────────────────────────────────────────────────

program
	.command('search <file> <pattern>')
	.description('Find all occurrences of a text or /regex/flags pattern and redact them')
	.option('--output <file>', 'Output PDF file path', 'redacted.pdf')
	.option('--color <hex>', 'Bar color as hex (e.g. #000000)', '#000000')
	.option('--label <text>', 'Label rendered inside the bar (e.g. REDACTED)')
	.option('--json', 'Print a JSON summary instead of human-readable output')
	.action(async (file: string, pattern: string, opts: { output: string; color: string; label?: string; json?: boolean }) => {
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
				[{ pattern: searchPattern, color, ...(opts.label ? { label: opts.label } : {}) }],
				{ addRedactionMarkers: !!opts.label },
			);
		} catch (err) {
			console.error(`Error: Redaction failed: ${String(err)}`);
			process.exit(1);
		}

		await writeFile(opts.output, result.pdf);

		if (opts.json) {
			console.log(JSON.stringify({ redactedCount: result.redactedCount, pagesAffected: result.pagesAffected, warnings: result.warnings, output: opts.output }, null, 2));
		} else {
			console.log(`Redacted ${result.redactedCount} region(s) across ${result.pagesAffected.length} page(s)`);
			console.log(`Wrote: ${opts.output}`);
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
	.option('--json', 'Print a JSON summary instead of human-readable output')
	.action(async (file: string, opts: { types?: string; output: string; json?: boolean }) => {
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

		let result: Awaited<ReturnType<typeof redactEntities>>;
		try {
			result = await redactEntities(pdfBuffer.buffer as ArrayBuffer, types);
		} catch (err) {
			console.error(`Error: Redaction failed: ${String(err)}`);
			process.exit(1);
		}

		await writeFile(opts.output, result.pdf);

		if (opts.json) {
			console.log(JSON.stringify({ redactedCount: result.redactedCount, pagesAffected: result.pagesAffected, warnings: result.warnings, output: opts.output }, null, 2));
		} else {
			console.log(`Redacted ${result.redactedCount} entity match(es) across ${result.pagesAffected.length} page(s)`);
			console.log(`Types: ${types.join(', ')}`);
			console.log(`Wrote: ${opts.output}`);
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

program.parseAsync(process.argv).catch((err) => {
	console.error(String(err));
	process.exit(1);
});
