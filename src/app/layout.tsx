import type { Metadata } from "next";
import "./globals.css";
import "../styles/manga-components.css";

export const metadata: Metadata = {
	title: "Story to Comic Generator",
	description: "Transform your stories into manga and comic pages using AI",
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
