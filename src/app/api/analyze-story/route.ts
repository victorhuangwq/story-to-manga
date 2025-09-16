import { GoogleGenAI, Type } from "@google/genai";
import { type NextRequest, NextResponse } from "next/server";
import { getGoogleAiApiKey } from "@/lib/api-keys";
import { callGeminiWithRetry } from "@/lib/gemini-helper";
import { parseGeminiJSON } from "@/lib/json-parser";
import {
	logApiRequest,
	logApiResponse,
	logError,
	storyAnalysisLogger,
} from "@/lib/logger";

interface Character {
	name: string;
	physicalDescription: string;
	personality: string;
	role: string;
}

interface Setting {
	timePeriod: string;
	location: string;
	mood: string;
}

interface AnalysisData {
	characters: Character[];
	setting: Setting;
}

const genAI = new GoogleGenAI({ apiKey: getGoogleAiApiKey(true) });
const model = "gemini-2.5-flash";

export async function POST(request: NextRequest) {
	const startTime = Date.now();
	const endpoint = "/api/analyze-story";

	logApiRequest(storyAnalysisLogger, endpoint);

	try {
		const { story, style } = await request.json();

		storyAnalysisLogger.debug(
			{
				story_length: story?.length || 0,
				style,
			},
			"Received story analysis request",
		);

		if (!story || !style) {
			storyAnalysisLogger.warn(
				{ story: !!story, style: !!style },
				"Missing required parameters",
			);
			logApiResponse(
				storyAnalysisLogger,
				endpoint,
				false,
				Date.now() - startTime,
				{ error: "Missing parameters" },
			);
			return NextResponse.json(
				{ error: "Story and style are required" },
				{ status: 400 },
			);
		}

		// Validate story length (500 words max)
		const wordCount = story.trim().split(/\s+/).length;
		storyAnalysisLogger.debug({ wordCount }, "Calculated word count");

		if (wordCount > 500) {
			storyAnalysisLogger.warn(
				{ wordCount, limit: 500 },
				"Story exceeds word limit",
			);
			logApiResponse(
				storyAnalysisLogger,
				endpoint,
				false,
				Date.now() - startTime,
				{ error: "Word limit exceeded" },
			);
			return NextResponse.json(
				{ error: `Story too long. Maximum 500 words, got ${wordCount} words.` },
				{ status: 400 },
			);
		}

		const prompt = `
Analyze this story and extract the main characters with their detailed characteristics:

Story: "${story}"

Style: ${style}

Please provide:
1. A title for this story (create a catchy, appropriate title if one isn't explicitly mentioned)

2. A list of main characters (1-4 maximum, choose based on story complexity) with:
   - Name
   - Physical description (age, build, hair, clothing, distinctive features)
   - Personality traits
   - Role in the story

3. Setting description (time period, location, mood)
`;

		let text: string;
		try {
			text = await callGeminiWithRetry(
				async () => {
					const result = await genAI.models.generateContent({
						model: model,
						contents: prompt,
						config: {
							responseMimeType: "application/json",
							responseSchema: {
								type: Type.OBJECT,
								properties: {
									title: {
										type: Type.STRING,
									},
									characters: {
										type: Type.ARRAY,
										items: {
											type: Type.OBJECT,
											properties: {
												name: {
													type: Type.STRING,
												},
												physicalDescription: {
													type: Type.STRING,
												},
												personality: {
													type: Type.STRING,
												},
												role: {
													type: Type.STRING,
												},
											},
											propertyOrdering: [
												"name",
												"physicalDescription",
												"personality",
												"role",
											],
										},
									},
									setting: {
										type: Type.OBJECT,
										properties: {
											timePeriod: {
												type: Type.STRING,
											},
											location: {
												type: Type.STRING,
											},
											mood: {
												type: Type.STRING,
											},
										},
										propertyOrdering: ["timePeriod", "location", "mood"],
									},
								},
								propertyOrdering: ["title", "characters", "setting"],
							},
						},
					});

					storyAnalysisLogger.debug(
						{
							response_length: result.text?.length || 0,
						},
						"Received response from Gemini API",
					);

					return result.text || "";
				},
				storyAnalysisLogger,
				{
					model: model,
					prompt_length: prompt.length,
				},
			);
		} catch (error) {
			logError(storyAnalysisLogger, error, "story analysis");
			logApiResponse(
				storyAnalysisLogger,
				endpoint,
				false,
				Date.now() - startTime,
				{ error: "Gemini API call failed" },
			);
			return NextResponse.json(
				{ error: "Failed to analyze story" },
				{ status: 500 },
			);
		}

		// Parse JSON response
		let analysisData: AnalysisData;
		try {
			analysisData = parseGeminiJSON<AnalysisData>(text);
			storyAnalysisLogger.info(
				{
					characters_count: analysisData.characters.length,
					has_setting: !!analysisData.setting,
				},
				"Successfully parsed story analysis",
			);
		} catch (parseError) {
			logError(storyAnalysisLogger, parseError, "JSON parsing", {
				response_text: text?.substring(0, 1000),
			});
			logApiResponse(
				storyAnalysisLogger,
				endpoint,
				false,
				Date.now() - startTime,
				{
					error: "JSON parsing failed",
					response_preview: text?.substring(0, 200),
				},
			);
			return NextResponse.json(
				{ error: "Failed to parse story analysis" },
				{ status: 500 },
			);
		}

		logApiResponse(
			storyAnalysisLogger,
			endpoint,
			true,
			Date.now() - startTime,
			{
				characters_count: analysisData.characters.length,
				word_count: wordCount,
			},
		);

		return NextResponse.json({
			success: true,
			analysis: analysisData,
			wordCount,
		});
	} catch (error) {
		logError(storyAnalysisLogger, error, "story analysis");
		logApiResponse(
			storyAnalysisLogger,
			endpoint,
			false,
			Date.now() - startTime,
			{ error: "Unexpected error" },
		);
		return NextResponse.json(
			{ error: "Failed to analyze story" },
			{ status: 500 },
		);
	}
}
