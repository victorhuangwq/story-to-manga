import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	turbopack: {
		root: __dirname,
	},
	serverExternalPackages: ["pino", "pino-pretty"],
};

export default nextConfig;
