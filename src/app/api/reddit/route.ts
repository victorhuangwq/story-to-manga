import { type NextRequest, NextResponse } from "next/server";

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

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const redditPath = searchParams.get("path");

		if (!redditPath) {
			return NextResponse.json(
				{ error: "Reddit path parameter is required" },
				{ status: 400 },
			);
		}

		// Extract subreddit and post ID from path like /r/subreddit/comments/postid/title
		const pathMatch = redditPath.match(/^\/r\/([^/]+)\/comments\/([^/]+)/);
		if (!pathMatch) {
			return NextResponse.json(
				{ error: "Invalid Reddit URL format" },
				{ status: 400 },
			);
		}

		const [, subreddit, postId] = pathMatch;
		const apiUrl = `https://www.reddit.com/r/${subreddit}/comments/${postId}.json`;

		const response = await fetch(apiUrl, {
			headers: {
				"User-Agent": "story-to-manga/1.0",
			},
		});

		if (!response.ok) {
			if (response.status === 404) {
				return NextResponse.json(
					{ error: "Reddit post not found" },
					{ status: 404 },
				);
			}
			if (response.status === 403) {
				return NextResponse.json(
					{ error: "Reddit post is private or restricted" },
					{ status: 403 },
				);
			}
			return NextResponse.json(
				{ error: `Failed to fetch Reddit post: ${response.status}` },
				{ status: response.status },
			);
		}

		const data: RedditApiResponse[] = await response.json();

		if (!data || !Array.isArray(data) || data.length === 0) {
			return NextResponse.json(
				{ error: "Invalid Reddit API response format" },
				{ status: 500 },
			);
		}

		const postData = data[0]?.data?.children?.[0]?.data;
		if (!postData) {
			return NextResponse.json(
				{ error: "No post data found in Reddit response" },
				{ status: 500 },
			);
		}

		const redditPostContent: RedditPostContent = {
			title: postData.title || "",
			body: postData.selftext || "",
			author: postData.author || "",
			subreddit: postData.subreddit || "",
			url: `https://www.reddit.com${postData.permalink}`,
		};

		return NextResponse.json({
			success: true,
			post: redditPostContent,
		});
	} catch (error) {
		console.error("Reddit proxy error:", error);
		return NextResponse.json(
			{
				error: `Network error while fetching Reddit post: ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
			},
			{ status: 500 },
		);
	}
}
