interface RateLimitEntry {
	count: number;
	resetTime: number;
}

interface RateLimitResult {
	success: boolean;
	limit: number;
	remaining: number;
	resetTime: number;
	retryAfter?: number;
}

class RateLimiter {
	private requests = new Map<string, RateLimitEntry>();
	private readonly windowMs: number;
	private readonly maxRequests: number;
	private cleanupInterval: NodeJS.Timeout;

	constructor(windowMs = 60000, maxRequests = 25) {
		this.windowMs = windowMs;
		this.maxRequests = maxRequests;

		// Cleanup expired entries every minute
		this.cleanupInterval = setInterval(() => {
			this.cleanup();
		}, this.windowMs);
	}

	private cleanup(): void {
		const now = Date.now();
		for (const [key, entry] of this.requests.entries()) {
			if (now >= entry.resetTime) {
				this.requests.delete(key);
			}
		}
	}

	public check(identifier: string): RateLimitResult {
		const now = Date.now();
		const existing = this.requests.get(identifier);

		if (!existing || now >= existing.resetTime) {
			// First request or window has expired - reset
			const resetTime = now + this.windowMs;
			this.requests.set(identifier, {
				count: 1,
				resetTime,
			});

			return {
				success: true,
				limit: this.maxRequests,
				remaining: this.maxRequests - 1,
				resetTime,
			};
		}

		// Window is still active
		if (existing.count >= this.maxRequests) {
			// Rate limit exceeded
			return {
				success: false,
				limit: this.maxRequests,
				remaining: 0,
				resetTime: existing.resetTime,
				retryAfter: Math.ceil((existing.resetTime - now) / 1000),
			};
		}

		// Increment counter
		existing.count++;
		this.requests.set(identifier, existing);

		return {
			success: true,
			limit: this.maxRequests,
			remaining: this.maxRequests - existing.count,
			resetTime: existing.resetTime,
		};
	}

	public destroy(): void {
		clearInterval(this.cleanupInterval);
		this.requests.clear();
	}
}

// Create a singleton instance for the application
const rateLimiter = new RateLimiter(60000, 25); // 25 requests per minute

export function checkRateLimit(ip: string, endpoint: string): RateLimitResult {
	const identifier = `${ip}:${endpoint}`;
	return rateLimiter.check(identifier);
}
