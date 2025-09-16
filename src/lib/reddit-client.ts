interface RedditPost {
	title: string;
	selftext: string;
	author: string;
	subreddit: string;
	url: string;
	permalink: string;
}

interface RedditApiResponse {
	data: {
		children: Array<{
			data: RedditPost;
		}>;
	};
}

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
	// Extract subreddit and post ID from path like /r/subreddit/comments/postid/title
	const pathMatch = redditPath.match(/^\/r\/([^/]+)\/comments\/([^/]+)/);
	if (!pathMatch) {
		throw new RedditApiError("Invalid Reddit URL format");
	}

	const [, subreddit, postId] = pathMatch;
	const apiUrl = `https://www.reddit.com/r/${subreddit}/comments/${postId}.json`;

	try {
		const response = await fetch(apiUrl, {
			headers: {
				"User-Agent": "story-to-manga/1.0",
			},
		});

		if (!response.ok) {
			if (response.status === 404) {
				throw new RedditApiError("Reddit post not found", 404);
			}
			if (response.status === 403) {
				throw new RedditApiError("Reddit post is private or restricted", 403);
			}
			throw new RedditApiError(
				`Failed to fetch Reddit post: ${response.status}`,
				response.status,
			);
		}

		const data: RedditApiResponse[] = await response.json();

		if (!data || !Array.isArray(data) || data.length === 0) {
			throw new RedditApiError("Invalid Reddit API response format");
		}

		const postData = data[0]?.data?.children?.[0]?.data;
		if (!postData) {
			throw new RedditApiError("No post data found in Reddit response");
		}

		return {
			title: postData.title || "",
			body: postData.selftext || "",
			author: postData.author || "",
			subreddit: postData.subreddit || "",
			url: `https://www.reddit.com${postData.permalink}`,
		};
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
