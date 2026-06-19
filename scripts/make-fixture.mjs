// make-fixture.mjs — generate a deterministic sample PDF for the README CLI demo.
// Writes scripts/.demo/sample.pdf containing a few lines of synthetic sensitive data
// (a fake SSN, email, and phone) so the recorded `pdf-redact` session is reproducible.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Absolute path to the demo working directory (kept out of git via scripts/.demo)
const HERE = dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = join(HERE, '.demo');

/** Build a single-page PDF with synthetic PII drawn at known positions. */
async function buildSample() {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 300]);
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);

	// Title
	page.drawText('PATIENT INTAKE RECORD', { x: 48, y: 250, size: 16, font: bold, color: rgb(0, 0, 0) });

	// Body lines containing synthetic, non-real sensitive data
	const lines = [
		'Name:   Jane A. Doe',
		'SSN:    123-45-6789',
		'Email:  jane.doe@example.com',
		'Phone:  (555) 867-5309',
		'Notes:  Routine follow-up scheduled.',
	];
	let y = 210;
	for (const line of lines) {
		page.drawText(line, { x: 48, y, size: 13, font, color: rgb(0.1, 0.1, 0.1) });
		y -= 26;
	}

	return doc.save();
}

await mkdir(DEMO_DIR, { recursive: true });
const bytes = await buildSample();
await writeFile(join(DEMO_DIR, 'sample.pdf'), bytes);
console.log(`Wrote ${join(DEMO_DIR, 'sample.pdf')} (${bytes.length} bytes)`);
