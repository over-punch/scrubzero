// render-before-after.mjs — produce the README before/after redaction stills.
// Generates the synthetic fixture, redacts it with the real CLI, renders both the
// original and redacted PDFs to PNG via `pdftoppm`, and copies them into assets/.
// Requires poppler's `pdftoppm` on PATH (brew install poppler).

import { execFile } from 'node:child_process';
import { mkdir, copyFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DEMO_DIR = join(HERE, '.demo');
const ASSETS = join(ROOT, 'assets');
const CLI = join(ROOT, 'dist', 'cli.js');

/** Run the bundled CLI with the given args inside the demo dir. */
async function cli(args) {
	await run('node', [CLI, ...args], { cwd: DEMO_DIR });
}

await mkdir(DEMO_DIR, { recursive: true });
await mkdir(ASSETS, { recursive: true });

// 1. Build the deterministic synthetic fixture.
await run('node', [join(HERE, 'make-fixture.mjs')]);

// 2. Redact it with the real CLI: entities first, then a labelled name search.
await cli(['entities', 'sample.pdf', '--types', 'ssn,email,phone', '--output', 'after-entities.pdf']);
await cli(['search', 'after-entities.pdf', 'Jane A. Doe', '--label', 'REDACTED', '--output', 'after.pdf']);

// 3. Render both PDFs to PNG (150 DPI) via pdftoppm.
await run('pdftoppm', ['-png', '-r', '150', join(DEMO_DIR, 'sample.pdf'), join(DEMO_DIR, 'before')]);
await run('pdftoppm', ['-png', '-r', '150', join(DEMO_DIR, 'after.pdf'), join(DEMO_DIR, 'after')]);

// 4. Copy the first-page renders into assets/ with stable names.
await copyFile(join(DEMO_DIR, 'before-1.png'), join(ASSETS, 'before.png'));
await copyFile(join(DEMO_DIR, 'after-1.png'), join(ASSETS, 'after.png'));

// Tidy intermediate PDFs (keep the dir; it is gitignored anyway).
await rm(join(DEMO_DIR, 'after-entities.pdf'), { force: true });

console.log(`Wrote ${join(ASSETS, 'before.png')} and ${join(ASSETS, 'after.png')}`);
