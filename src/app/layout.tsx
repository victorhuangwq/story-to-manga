import type { Metadata } from "next";
import "bootstrap/dist/css/bootstrap.min.css";
import "../styles/manga-theme.css";
import "./globals.css";

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
			<body>
				{children}
				<script
					src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
					integrity="sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz"
					crossOrigin="anonymous"
				></script>
			</body>
		</html>
	);
}
