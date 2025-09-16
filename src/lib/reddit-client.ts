interface RedditPostContent {
	title: string;
	body: string;
	author: string;
	subreddit: string;
	url: string;
}

export class RedditApiError extends Error {
	constructor(
		message: string,
		public status?: number,
	) {
		super(message);
		this.name = "RedditApiError";
	}
}

export async function fetchRedditPost(
	redditPath: string,
): Promise<RedditPostContent> {
	// Validate Reddit path format
	const pathMatch = redditPath.match(/^\/r\/([^/]+)\/comments\/([^/]+)/);
	if (!pathMatch) {
		throw new RedditApiError("Invalid Reddit URL format");
	}

	try {
		// Use our proxy API endpoint instead of direct Reddit API call
		const response = await fetch(
			`/api/reddit?path=${encodeURIComponent(redditPath)}`,
		);

		if (!response.ok) {
			const errorData = await response
				.json()
				.catch(() => ({ error: "Unknown error" }));
			if (response.status === 404) {
				throw new RedditApiError("Reddit post not found", 404);
			}
			if (response.status === 403) {
				throw new RedditApiError("Reddit post is private or restricted", 403);
			}
			throw new RedditApiError(
				errorData.error || `Failed to fetch Reddit post: ${response.status}`,
				response.status,
			);
		}

		const responseData = await response.json();

		if (!responseData.success || !responseData.post) {
			throw new RedditApiError("Invalid API response format");
		}

		return responseData.post;
	} catch (error) {
		if (error instanceof RedditApiError) {
			throw error;
		}
		throw new RedditApiError(
			`Network error while fetching Reddit post: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

export function formatRedditStory(post: RedditPostContent): string {
	// Combine title and body with double newline separator
	if (!post.body.trim()) {
		return post.title;
	}
	return `${post.title}\n\n${post.body}`;
}
