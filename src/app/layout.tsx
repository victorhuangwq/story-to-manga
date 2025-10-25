import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata } from "next";
import "../styles/manga-components.css";
import "../styles/manga-theme.css";
import "./globals.css";

export const metadata: Metadata = {
	metadataBase: new URL("https://app.storytomanga.com"),
	title: {
		default: "Story to Manga Machine - AI Comic & Manga Generator",
		template: "%s | Story to Manga Machine",
	},
	description:
		"Transform written stories into stunning visual manga or comic book pages using AI. Create consistent characters, generate panels, and share your comics instantly.",
	keywords: [
		"manga generator",
		"comic book creator",
		"AI comics",
		"story to manga",
		"visual storytelling",
		"comic panels",
		"character design",
	],
	authors: [{ name: "Story to Manga Team" }],
	creator: "Story to Manga Machine",
	publisher: "Story to Manga Machine",
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
		},
	},
	openGraph: {
		title: "Story to Manga Machine - AI Comic & Manga Generator",
		description:
			"Transform written stories into stunning visual manga or comic book pages using AI. Create consistent characters, generate panels, and share your comics instantly.",
		url: "https://app.storytomanga.com",
		siteName: "Story to Manga Machine",
		images: [
			{
				url: "/og-image.png",
				width: 1200,
				height: 630,
				alt: "Story to Manga Machine - Transform stories into manga and comics with AI",
			},
		],
		type: "website",
		locale: "en_US",
	},
	twitter: {
		card: "summary_large_image",
		title: "Story to Manga Machine - AI Comic & Manga Generator",
		description:
			"Transform written stories into stunning visual manga or comic book pages using AI.",
		images: ["/og-image.png"],
		site: "@storytomanga",
	},
	alternates: {
		canonical: "https://app.storytomanga.com",
	},
	category: "entertainment",
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
