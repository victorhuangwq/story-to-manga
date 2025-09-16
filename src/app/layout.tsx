import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata } from "next";
import "../styles/manga-components.css";
import "../styles/manga-theme.css";
import "./globals.css";

export const metadata: Metadata = {
	metadataBase: new URL("https://storytomanga.com"),
	title: "Story to Manga Machine",
	description:
			"Transform stories into manga and comic pages with IA",
	openGraph: {
		title: "Story to Manga",
		description:
			"Transform stories into manga and comic pages with IA",
		url: "https://storytomanga.com",
		images: [
			{
				url: "/og-image.png",
				width: 1200,
				height: 630,
				alt: "Story to Manga - Transform stories into manga",
			},
		],
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "Story to Manga",
		description:
			"Transform stories into manga and comic pages with IA",
		images: ["/og-image.png"],
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body suppressHydrationWarning={true}>
				{children}
				<GoogleAnalytics gaId={process.env["NEXT_PUBLIC_GA_MEASUREMENT_ID"]!} />
			</body>
		</html>
	);
}
