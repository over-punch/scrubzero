import type { Metadata } from "next"
import "./globals.css"
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google"
import { Analytics } from "@/components/Analytics"
import { CookieBanner } from "@/components/CookieBanner"
import { RedactTransition } from "@/components/RedactTransition"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const instrumentSerif = Instrument_Serif({
	subsets: ["latin"],
	weight: "400",
	style: ["normal", "italic"],
	variable: "--font-instrument",
})
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" })

export const metadata: Metadata = {
	title: "scrubzero — True PDF content-stream redaction",
	icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" },
	description: "scrubzero removes text from PDF content streams before drawing the visual bar — no hidden layers, no recoverable text. Designed for Node.js and AWS Lambda.",
	keywords: ["scrubzero", "pdf redaction", "pdf-lib", "pdfjs", "content stream", "Node.js pdf", "FOIA redaction", "npm"],
	openGraph: {
		title: "scrubzero — True PDF content-stream redaction",
		description: "Removes text from content streams before drawing the bar. No hidden layers. Works in Node.js and Lambda.",
		url: "https://scrubzero.org",
		siteName: "scrubzero",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "scrubzero — True PDF content-stream redaction",
		description: "Removes text from content streams before drawing the bar. No hidden layers.",
	},
	metadataBase: new URL("https://scrubzero.org"),
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`h-full ${inter.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}>
			<body className="min-h-full flex flex-col">
				<RedactTransition>
					{children}
				</RedactTransition>
				<Analytics />
				<CookieBanner />
			</body>
		</html>
	)
}
