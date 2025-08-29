import { GoogleGenAI } from "@google/genai";
import { type NextRequest, NextResponse } from "next/server";
import { parseGeminiJSON } from "@/lib/json-parser";
import {
	logApiRequest,
	logApiResponse,
	logError,
	storyChunkingLogger,
} from "@/lib/logger";

const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });

export async function POST(request: NextRequest) {
	const startTime = Date.now();
	const endpoint = "/api/chunk-story";

	logApiRequest(storyChunkingLogger, endpoint);

	try {
		const { story, characters, setting, style } = await request.json();

		storyChunkingLogger.debug(
			{
				story_length: story?.length || 0,
				characters_count: characters?.length || 0,
				style,
				setting: !!setting,
			},
			"Received story chunking request",
		);

		if (!story || !characters || !setting || !style) {
			storyChunkingLogger.warn(
				{
					story: !!story,
					characters: !!characters,
					setting: !!setting,
					style: !!style,
				},
				"Missing required parameters",
			);
			logApiResponse(
				storyChunkingLogger,
				endpoint,
				false,
				Date.now() - startTime,
				{ error: "Missing parameters" },
			);
			return NextResponse.json(
				{ error: "Story, characters, setting, and style are required" },
				{ status: 400 },
			);
		}

		const characterNames = characters
			.map((c: { name: string }) => c.name)
			.join(", ");

		storyChunkingLogger.debug(
			{
				character_names: characterNames,
				layout_style: style,
			},
			"Extracted character names and determined layout style",
		);

		const layoutGuidance =
			style === "manga"
				? `
Manga layout guidelines:
- Right-to-left reading flow
- Dynamic panel shapes and sizes
- 4-6 panels per page maximum
- Vertical emphasis for dramatic moments
- Action lines and motion blur for movement
- Close-ups for emotional beats
- Wide shots for establishing scenes
`
				: `
American comic layout guidelines:
- Left-to-right reading flow
- Rectangular panels in grid format
- 4-6 panels per page maximum
- Consistent panel borders
- Wide establishing shots
- Medium shots for dialogue
- Close-ups for dramatic moments
`;

		const prompt = `
Break down this story into comic book pages with detailed panel descriptions.

Story: "${story}"
Characters: ${characterNames}
Setting: ${setting.location}, ${setting.timePeriod}, ${setting.mood}
Style: ${style}

${layoutGuidance}

Create 2-4 pages maximum. For each page, describe:
1. Panel layout (how many panels, arrangement)
2. Each panel with:
   - Characters present
   - Action/scene description
   - Dialogue (if any)
   - Camera angle (close-up, medium shot, wide shot, etc.)
   - Visual mood/atmosphere

Format as JSON:
{
  "pages": [
    {
      "pageNumber": 1,
      "panelLayout": "Description of panel arrangement (e.g., '3 panels - large top panel, two smaller bottom panels')",
      "panels": [
        {
          "panelNumber": 1,
          "characters": ["Character names present"],
          "sceneDescription": "Detailed description of what's happening",
          "dialogue": "Any spoken text or thought bubbles",
          "cameraAngle": "Shot type and perspective",
          "visualMood": "Atmosphere and visual style notes"
        }
      ]
    }
  ]
}
`;

		storyChunkingLogger.info(
			{
				model: "gemini-2.5-flash",
				prompt_length: prompt.length,
				layout_guidance_type: style,
			},
			"Calling Gemini API for story chunking",
		);

		const result = await genAI.models.generateContent({
			model: "gemini-2.5-flash",
			contents: prompt,
		});
		const text = result.text || "";

		storyChunkingLogger.debug(
			{
				response_length: text.length,
			},
			"Received response from Gemini API",
		);

		// Parse JSON response
		let storyBreakdown: { pages?: Array<{ panels?: Array<unknown> }> };
		try {
			storyBreakdown = parseGeminiJSON(text);
			storyChunkingLogger.info(
				{
					pages_count: storyBreakdown.pages?.length || 0,
					total_panels:
						storyBreakdown.pages?.reduce(
							(sum: number, page: { panels?: Array<unknown> }) =>
								sum + (page.panels?.length || 0),
							0,
						) || 0,
				},
				"Successfully parsed story breakdown",
			);
		} catch (parseError) {
			logError(storyChunkingLogger, parseError, "JSON parsing", {
				response_text: text?.substring(0, 1000),
			});
			logApiResponse(
				storyChunkingLogger,
				endpoint,
				false,
				Date.now() - startTime,
				{ error: "JSON parsing failed" },
			);
			return NextResponse.json(
				{ error: "Failed to parse story breakdown" },
				{ status: 500 },
			);
		}

		logApiResponse(
			storyChunkingLogger,
			endpoint,
			true,
			Date.now() - startTime,
			{
				pages_generated: storyBreakdown.pages?.length || 0,
				total_panels:
					storyBreakdown.pages?.reduce(
						(sum: number, page: { panels?: Array<unknown> }) =>
							sum + (page.panels?.length || 0),
						0,
					) || 0,
			},
		);

		return NextResponse.json({
			success: true,
			storyBreakdown,
		});
	} catch (error) {
		logError(storyChunkingLogger, error, "story chunking");
		logApiResponse(
			storyChunkingLogger,
			endpoint,
			false,
			Date.now() - startTime,
			{ error: "Unexpected error" },
		);
		return NextResponse.json(
			{ error: "Failed to chunk story" },
			{ status: 500 },
		);
	}
}
