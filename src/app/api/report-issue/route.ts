import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { type, description, userAgent } = body;

		if (!type || !description) {
			return NextResponse.json(
				{ error: "Type and description are required" },
				{ status: 400 },
			);
		}

		const githubToken = process.env["GITHUB_PAT"];
		const githubOwner = process.env["GITHUB_OWNER"] || "victorhuangwq";
		const githubRepo = process.env["GITHUB_REPO"] || "story-to-manga";

		if (!githubToken) {
			console.error("GitHub PAT not configured");
			return NextResponse.json(
				{ error: "Issue reporting not configured" },
				{ status: 500 },
			);
		}

		const response = await fetch(
			`https://api.github.com/repos/${githubOwner}/${githubRepo}/dispatches`,
			{
				method: "POST",
				headers: {
					Accept: "application/vnd.github.v3+json",
					Authorization: `Bearer ${githubToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					event_type: "create-issue",
					client_payload: {
						type,
						description,
						user_agent: userAgent || "Unknown",
						timestamp: new Date().toISOString(),
					},
				}),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			console.error("GitHub API error:", response.status, errorText);
			return NextResponse.json(
				{ error: "Failed to submit issue" },
				{ status: response.status },
			);
		}

		return NextResponse.json(
			{ success: true, message: "Issue submitted successfully" },
			{ status: 200 },
		);
	} catch (error) {
		console.error("Error submitting issue:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
