import { GoogleGenAI, Type } from "@google/genai";
import { getGoogleAiApiKey } from "@/lib/api-keys";
import { callGeminiWithRetry } from "@/lib/gemini-helper";
import { parseGeminiJSON } from "@/lib/json-parser";
import { logError, storyAnalysisLogger } from "@/lib/logger";

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

interface StoryAnalysis {
	title: string;
	characters: Character[];
	setting: Setting;
}

const genAI = new GoogleGenAI({ apiKey: getGoogleAiApiKey(true) });
const model = "gemini-2.5-flash";

export async function analyzeStory(
	story: string,
	style: string,
): Promise<StoryAnalysis> {
	storyAnalysisLogger.debug(
		{
			story_length: story?.length || 0,
			style,
		},
		"Analyzing story",
	);

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

	const text = await callGeminiWithRetry(
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

	const analysisData = parseGeminiJSON<StoryAnalysis>(text);

	storyAnalysisLogger.info(
		{
			title: analysisData.title,
			characters_count: analysisData.characters.length,
			has_setting: !!analysisData.setting,
		},
		"Successfully analyzed story",
	);

	return analysisData;
}