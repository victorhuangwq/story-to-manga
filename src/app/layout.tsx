import type { Metadata } from "next";
import "../styles/manga-components.css";
import "../styles/manga-theme.css";
import "./globals.css";

export const metadata: Metadata = {
	title: "Story to Manga Generator",
	description: "Transform your stories into manga and comic pages using Nano Banana (Gemini 2.5 Flash Image)",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
