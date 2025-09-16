import { GoogleGenAI, Type } from "@google/genai";
import { type NextRequest, NextResponse } from "next/server";
import { getGoogleAiApiKey } from "@/lib/api-keys";
import { callGeminiWithRetry } from "@/lib/gemini-helper";
import { parseGeminiJSON } from "@/lib/json-parser";
import {
	logApiRequest,
	logApiResponse,
	logError,
	storyChunkingLogger,
} from "@/lib/logger";

interface Panel {
	panelNumber: number;
	characters: string[];
	sceneDescription: string;
	dialogue: string;
	cameraAngle: string;
	visualMood: string;
}

interface StoryBreakdown {
	panels: Panel[];
}

const genAI = new GoogleGenAI({ apiKey: getGoogleAiApiKey(true) });
const model = "gemini-2.5-flash";

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
Manga panel guidelines:
- Dynamic panel shapes and sizes
- Vertical emphasis for dramatic moments
- Action lines and motion blur for movement
- Close-ups for emotional beats
- Wide shots for establishing scenes
- Dramatic angles and perspectives
`
				: `
American comic panel guidelines:
- Rectangular panels with consistent borders
- Wide establishing shots
- Medium shots for dialogue
- Close-ups for dramatic moments
- Clean, structured compositions
- Bold, clear visual storytelling
`;

		const prompt = `
Break down this story into individual comic panels with detailed descriptions.

Story: "${story}"
Characters: ${characterNames}
Setting: ${setting.location}, ${setting.timePeriod}, ${setting.mood}
Style: ${style}

${layoutGuidance}

Create 2-15 panels based on the story's complexity and pacing needs. Choose the optimal number of panels to tell this story effectively - simple stories may need fewer panels (2-6), while complex narratives may require more (8-12).

For each panel, describe:
- Characters present
- Action/scene description
- Dialogue (if any)
- Camera angle (close-up, medium shot, wide shot, etc.)
- Visual mood/atmosphere

Return as a flat array of panels with sequential panel numbers.
`;

		let text: string;
		try {
			text = await callGeminiWithRetry(
				async () => {
					const result = await genAI.models.generateContent({
						model: model,
						contents: prompt,
						config: {
							thinkingConfig: {
								thinkingBudget: 8192, // Give model time to think through panel layout
							},
							responseMimeType: "application/json",
							responseSchema: {
								type: Type.OBJECT,
								properties: {
									panels: {
										type: Type.ARRAY,
										items: {
											type: Type.OBJECT,
											properties: {
												panelNumber: {
													type: Type.NUMBER,
												},
												characters: {
													type: Type.ARRAY,
													items: {
														type: Type.STRING,
													},
												},
												sceneDescription: {
													type: Type.STRING,
												},
												dialogue: {
													type: Type.STRING,
												},
												cameraAngle: {
													type: Type.STRING,
												},
												visualMood: {
													type: Type.STRING,
												},
											},
											propertyOrdering: [
												"panelNumber",
												"characters",
												"sceneDescription",
												"dialogue",
												"cameraAngle",
												"visualMood",
											],
										},
									},
								},
								propertyOrdering: ["panels"],
							},
						},
					});

					storyChunkingLogger.debug(
						{
							response_length: result.text?.length || 0,
						},
						"Received response from Gemini API",
					);

					return result.text || "";
				},
				storyChunkingLogger,
				{
					model: model,
					prompt_length: prompt.length,
					layout_guidance_type: style,
				},
			);
		} catch (error) {
			logError(storyChunkingLogger, error, "story chunking");
			logApiResponse(
				storyChunkingLogger,
				endpoint,
				false,
				Date.now() - startTime,
				{ error: "Gemini API call failed" },
			);
			return NextResponse.json(
				{ error: "Failed to chunk story" },
				{ status: 500 },
			);
		}

		// Parse JSON response
		let storyBreakdown: StoryBreakdown;
		try {
			storyBreakdown = parseGeminiJSON<StoryBreakdown>(text);
			storyChunkingLogger.info(
				{
					total_panels: storyBreakdown.panels.length,
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
				panels_generated: storyBreakdown.panels.length,
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
