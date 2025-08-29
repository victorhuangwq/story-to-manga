import { GoogleGenAI } from "@google/genai";
import { type NextRequest, NextResponse } from "next/server";
import {
	characterGenLogger,
	logApiRequest,
	logApiResponse,
	logError,
} from "@/lib/logger";

const genAI = new GoogleGenAI({ apiKey: process.env["GOOGLE_AI_API_KEY"]! });
const model = "gemini-2.5-flash-image-preview";

export async function POST(request: NextRequest) {
	const startTime = Date.now();
	const endpoint = "/api/generate-character-refs";

	logApiRequest(characterGenLogger, endpoint);

	try {
		const { characters, setting, style } = await request.json();

		characterGenLogger.debug(
			{
				characters_count: characters?.length || 0,
				style,
				setting: !!setting,
			},
			"Received character reference generation request",
		);

		if (!characters || !setting || !style) {
			characterGenLogger.warn(
				{
					characters: !!characters,
					setting: !!setting,
					style: !!style,
				},
				"Missing required parameters",
			);
			logApiResponse(
				characterGenLogger,
				endpoint,
				false,
				Date.now() - startTime,
				{ error: "Missing parameters" },
			);
			return NextResponse.json(
				{ error: "Characters, setting, and style are required" },
				{ status: 400 },
			);
		}

		const characterReferences = [];

		characterGenLogger.info(
			{
				model: model,
				characters_to_generate: characters.length,
			},
			"Starting character reference generation",
		);

		for (const character of characters) {
			const characterStartTime = Date.now();
			characterGenLogger.debug(
				{ character_name: character.name },
				"Generating character reference",
			);
			const stylePrefix =
				style === "manga"
					? "Japanese manga style, black and white, detailed character design with clean line art and screentones"
					: "American comic book style, colorful superhero art with bold colors and clean line art";

			const prompt = `
Character reference sheet in ${stylePrefix}. 

Full body character design showing front view of ${character.name}:
- Physical appearance: ${character.physicalDescription}
- Personality: ${character.personality}
- Role: ${character.role}
- Setting context: ${setting.timePeriod}, ${setting.location}

The character should be drawn in a neutral pose against a plain background, showing their full design clearly for reference purposes. This is a character reference sheet that will be used to maintain consistency across multiple comic panels.
`;

			try {
				characterGenLogger.debug(
					{
						character_name: character.name,
						prompt_length: prompt.length,
						style_prefix: `${stylePrefix.substring(0, 50)}...`,
					},
					"Calling Gemini API for character generation",
				);

				const result = await genAI.models.generateContent({
					model: model,
					contents: prompt,
				});

				// Get the image data
				const imageData = result.candidates?.[0]?.content?.parts?.[0];

				if (imageData && "inlineData" in imageData) {
					const base64Image = imageData.inlineData?.data || "";
					const mimeType = imageData.inlineData?.mimeType || "image/jpeg";

					characterReferences.push({
						name: character.name,
						image: `data:${mimeType};base64,${base64Image}`,
						description: character.physicalDescription,
					});

					characterGenLogger.info(
						{
							character_name: character.name,
							mime_type: mimeType,
							image_size_kb: base64Image
								? Math.round((base64Image.length * 0.75) / 1024)
								: 0,
							duration_ms: Date.now() - characterStartTime,
						},
						"Successfully generated character reference",
					);
				} else {
					throw new Error("No image data received");
				}
			} catch (error) {
				logError(characterGenLogger, error, "character reference generation", {
					character_name: character.name,
					duration_ms: Date.now() - characterStartTime,
				});
				logApiResponse(
					characterGenLogger,
					endpoint,
					false,
					Date.now() - startTime,
					{
						error: "Character generation failed",
						failed_character: character.name,
					},
				);
				return NextResponse.json(
					{ error: `Failed to generate reference for ${character.name}` },
					{ status: 500 },
				);
			}

			// Add delay to respect rate limits (free tier: 10 RPM)
			if (characters.indexOf(character) < characters.length - 1) {
				characterGenLogger.debug(
					{ delay_ms: 6500 },
					"Applying rate limit delay",
				);
				await new Promise((resolve) => setTimeout(resolve, 6500)); // 6.5 second delay
			}
		}

		logApiResponse(characterGenLogger, endpoint, true, Date.now() - startTime, {
			characters_generated: characterReferences.length,
			total_image_size_kb: characterReferences.reduce((sum, ref) => {
				const base64 = ref.image.split(",")[1] || "";
				return sum + Math.round((base64.length * 0.75) / 1024);
			}, 0),
		});

		return NextResponse.json({
			success: true,
			characterReferences,
		});
	} catch (error) {
		logError(characterGenLogger, error, "character reference generation");
		logApiResponse(
			characterGenLogger,
			endpoint,
			false,
			Date.now() - startTime,
			{ error: "Unexpected error" },
		);
		return NextResponse.json(
			{ error: "Failed to generate character references" },
			{ status: 500 },
		);
	}
}
