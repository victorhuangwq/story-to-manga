import { type NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limiter";

function getClientIP(request: NextRequest): string {
	// Check various headers for the real client IP
	const forwardedFor = request.headers.get("x-forwarded-for");
	const realIP = request.headers.get("x-real-ip");
	const cfConnectingIP = request.headers.get("cf-connecting-ip");

	// x-forwarded-for can contain multiple IPs, take the first one
	if (forwardedFor) {
		return forwardedFor.split(",")[0]?.trim() || "unknown";
	}

	if (realIP) {
		return realIP.trim();
	}

	if (cfConnectingIP) {
		return cfConnectingIP.trim();
	}

	// Fallback to unknown if no IP found
	return "unknown";
}

function getEndpointName(pathname: string): string {
	// Extract endpoint name from API path
	const apiMatch = pathname.match(/^\/api\/([^/]+)/);
	return apiMatch?.[1] ?? "unknown";
}

export function proxy(request: NextRequest) {
	const url = request.nextUrl.clone();
	const hostname = request.headers.get("host") || "";
	const pathname = url.pathname;

	// Check if path matches Reddit URL pattern: /r/subreddit/comments/postid/...
	const isRedditPath = /^\/r\/[^/]+\/comments\/[^/]+/.test(pathname);

	// Handle Reddit URLs - either from reddit subdomain or Reddit path pattern
	if (hostname.startsWith("reddit.") || isRedditPath) {
		// Redirect to main page with reddit path as query param
		url.pathname = "/";
		url.searchParams.set("reddit", pathname);
		return NextResponse.redirect(url);
	}

	// Only apply rate limiting to API routes
	if (!request.nextUrl.pathname.startsWith("/api/")) {
		return NextResponse.next();
	}

	const ip = getClientIP(request);
	const endpoint = getEndpointName(request.nextUrl.pathname);

	// Check rate limit
	const rateLimitResult = checkRateLimit(ip, endpoint);

	// Create response (either continue or rate limit)
	let response: NextResponse;

	if (!rateLimitResult.success) {
		// Rate limit exceeded
		response = new NextResponse(
			JSON.stringify({
				error: "Too Many Requests",
				message: `Rate limit exceeded for ${endpoint} endpoint. Please try again later.`,
				retryAfter: rateLimitResult.retryAfter,
			}),
			{
				status: 429,
				headers: {
					"Content-Type": "application/json",
				},
			},
		);
	} else {
		// Allow request to proceed
		response = NextResponse.next();
	}

	// Add rate limiting headers to response
	response.headers.set("X-RateLimit-Limit", rateLimitResult.limit.toString());
	response.headers.set(
		"X-RateLimit-Remaining",
		rateLimitResult.remaining.toString(),
	);
	response.headers.set(
		"X-RateLimit-Reset",
		new Date(rateLimitResult.resetTime).toISOString(),
	);

	if (rateLimitResult.retryAfter) {
		response.headers.set("Retry-After", rateLimitResult.retryAfter.toString());
	}

	return response;
}

export const config = {
	matcher: [
		/*
		 * Match all request paths except for the ones starting with:
		 * - _next/static (static files)
		 * - _next/image (image optimization files)
		 * - favicon.ico (favicon file)
		 * - public folder files
		 */
		"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
	],
};
