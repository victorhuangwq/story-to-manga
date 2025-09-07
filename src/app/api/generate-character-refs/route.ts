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

// Helper function to convert base64 to format expected by Gemini
function prepareImageForGemini(base64Image: string) {
	// Remove data:image/xxx;base64, prefix if present
	const base64Data = base64Image.replace(/^data:image\/[^;]+;base64,/, "");
	return {
		inlineData: {
			data: base64Data,
			mimeType: "image/jpeg",
		},
	};
}

export async function POST(request: NextRequest) {
	const startTime = Date.now();
	const endpoint = "/api/generate-character-refs";

	logApiRequest(characterGenLogger, endpoint);

	try {
		const {
			characters,
			setting,
			style,
			uploadedCharacterReferences = [],
		} = await request.json();

		characterGenLogger.debug(
			{
				characters_count: characters?.length || 0,
				style,
				setting: !!setting,
				uploaded_refs_count: uploadedCharacterReferences?.length || 0,
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
					? "Japanese manga style, black and white, detailed character design with clean line art and screentones, English text only"
					: "American comic book style, colorful superhero art with bold colors and clean line art";

			// Find uploaded references that match this character
			const matchingUploads = uploadedCharacterReferences.filter(
				(ref: { name: string; image: string; id: string; fileName: string }) =>
					ref.name.toLowerCase().includes(character.name.toLowerCase()) ||
					character.name.toLowerCase().includes(ref.name.toLowerCase()),
			);

			let prompt = `
Character reference sheet in ${stylePrefix}. 

Full body character design showing front view of ${character.name}:
- Physical appearance: ${character.physicalDescription}
- Personality: ${character.personality}
- Role: ${character.role}
- Setting context: ${setting.timePeriod}, ${setting.location}
`;

			// Add reference to uploaded images if any match
			if (matchingUploads.length > 0) {
				prompt += `

IMPORTANT: Use the provided reference images as inspiration for this character's design. The reference images show visual elements that should be incorporated while adapting them to the ${stylePrefix} aesthetic. Maintain the essence and key visual features shown in the references.
`;
			} else if (uploadedCharacterReferences.length > 0) {
				prompt += `

Note: Reference images are provided, but use them as general style inspiration for this character design.
`;
			}

			prompt += `

The character should be drawn in a neutral pose against a plain background, showing their full design clearly for reference purposes. This is a character reference sheet that will be used to maintain consistency across multiple comic panels.
`;

			// Prepare input parts for Gemini API
			const inputParts: Array<
				{ text: string } | { inlineData: { data: string; mimeType: string } }
			> = [{ text: prompt }];

			// Add uploaded reference images to input
			for (const upload of uploadedCharacterReferences as {
				name: string;
				image: string;
				id: string;
				fileName: string;
			}[]) {
				if (upload.image) {
					inputParts.push(prepareImageForGemini(upload.image));
				}
			}

			try {
				characterGenLogger.debug(
					{
						character_name: character.name,
						prompt_length: prompt.length,
						style_prefix: `${stylePrefix.substring(0, 50)}...`,
						matching_uploads: matchingUploads.length,
						total_uploads: uploadedCharacterReferences.length,
						input_parts_count: inputParts.length,
					},
					"Calling Gemini API for character generation",
				);

				const result = await genAI.models.generateContent({
					model: model,
					contents: inputParts,
				});

				// Process the response following the official pattern
				const candidate = result.candidates?.[0];
				if (!candidate?.content?.parts) {
					throw new Error("No content parts received");
				}

				let imageFound = false;
				for (const part of candidate.content.parts) {
					if (part.text) {
						characterGenLogger.info(
							{
								character_name: character.name,
								text_response: part.text,
								text_length: part.text.length,
							},
							"Received text response from model (full content)",
						);
					} else if (part.inlineData) {
						const imageData = part.inlineData.data;
						const mimeType = part.inlineData.mimeType || "image/jpeg";

						characterReferences.push({
							name: character.name,
							image: `data:${mimeType};base64,${imageData}`,
							description: character.physicalDescription,
						});

						characterGenLogger.info(
							{
								character_name: character.name,
								mime_type: mimeType,
								image_size_kb: imageData
									? Math.round((imageData.length * 0.75) / 1024)
									: 0,
								duration_ms: Date.now() - characterStartTime,
							},
							"Successfully generated character reference",
						);

						imageFound = true;
						break;
					}
				}

				if (!imageFound) {
					throw new Error("No image data received in response parts");
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
