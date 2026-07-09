// PrivacyNote — one honest, consistent statement of where an uploaded PDF goes.
// Shared across all three scrubzero modes so the answer never drifts between them.

/**
 * A single-line, mono-styled note for the masthead answering the first question
 * every user of a redaction tool asks: where does my file go?
 *
 * @param ai When true, adds the disclosure that opt-in AI detection sends
 *           extracted text to Anthropic using the user's own key.
 */
export function PrivacyNote({ ai = false }: { ai?: boolean }) {
	return (
		<div className="mt-2 mono-label" style={{ color: "var(--ink-faint)", letterSpacing: "0.08em", lineHeight: 1.5 }}>
			Your PDF is processed in memory on our server, never written to disk or logged, and discarded the moment the response is sent.
			{ai
				? " Regex detection runs on the server; opt-in AI detection sends extracted text to Anthropic with your own key."
				: " No third parties, no AI, no tracking of file contents."}
		</div>
	)
}
