import { GoogleGenAI, Type } from "@google/genai";
import { getGoogleAiApiKey } from "@/lib/api-keys";
import { callGeminiWithRetry } from "@/lib/gemini-helper";
import { parseGeminiJSON } from "@/lib/json-parser";
import { storyChunkingLogger } from "@/lib/logger";

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

const genAI = new GoogleGenAI({ apiKey: getGoogleAiApiKey(true) });
const model = "gemini-2.5-flash";

export async function chunkStory(
	story: string,
	characters: Character[],
	setting: Setting,
	style: string,
): Promise<StoryBreakdown> {
	storyChunkingLogger.debug(
		{
			story_length: story?.length || 0,
			characters_count: characters?.length || 0,
			style,
			setting: !!setting,
		},
		"Chunking story into panels",
	);

	const characterNames = characters.map((c) => c.name).join(", ");

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

	const storyBreakdown = parseGeminiJSON<StoryBreakdown>(text);

	storyChunkingLogger.info(
		{
			total_panels: storyBreakdown.panels.length,
		},
		"Successfully chunked story into panels",
	);

	return storyBreakdown;
}