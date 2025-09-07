import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	serverExternalPackages: ["pino", "pino-pretty"],
	outputFileTracingRoot: __dirname,
};

export default nextConfig;
