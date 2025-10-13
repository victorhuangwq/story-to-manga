import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	serverExternalPackages: ["pino", "pino-pretty"],
	outputFileTracingRoot: __dirname,
	async headers() {
		return [
			{
				source: "/(.*)",
				headers: [
					{
						key: "Access-Control-Allow-Origin",
						value: "*",
					},
				],
			},
		];
	},
	async rewrites() {
		return [
			{
				source: "/ingest/static/:path*",
				destination: "https://us-assets.i.posthog.com/static/:path*",
			},
			{
				source: "/ingest/:path*",
				destination: "https://us.i.posthog.com/:path*",
			},
		];
	},
	// This is required to support PostHog trailing slash API requests
	skipTrailingSlashRedirect: true,
};

export default nextConfig;
