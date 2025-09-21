import { GoogleGenAI } from "@google/genai";
import { type NextRequest, NextResponse } from "next/server";
import { getGoogleAiApiKey } from "@/lib/api-keys";
import { prepareImageForBedrock } from "@/lib/bedrock-helper";
import { type ApiResponse, callGeminiWithRetry } from "@/lib/gemini-helper";
import {
	characterGenLogger,
	logApiRequest,
	logApiResponse,
	logError,
} from "@/lib/logger";

const genAI = new GoogleGenAI({ apiKey: getGoogleAiApiKey(false) });
// Model will be determined dynamically by callGeminiWithRetry

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

		const characterReferences: Array<{
			name: string;
			image: string;
			description: string;
		}> = [];

		characterGenLogger.info(
			{
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
				// Prepare Bedrock fallback parameters
				const bedrockMessages = [
					{
						role: "user",
						content: [
							{ type: "text", text: prompt },
							// Add reference images for Bedrock
							...(
								uploadedCharacterReferences as {
									name: string;
									image: string;
									id: string;
									fileName: string;
								}[]
							)
								.filter((upload) => upload.image)
								.map((upload) => ({
									type: "image",
									image: prepareImageForBedrock(upload.image),
								})),
						],
					},
				];

				const response = await callGeminiWithRetry(
					genAI,
					inputParts,
					undefined, // No config needed for image generation
					(result) => {
						// Process the response following the official pattern
						const candidate = (
							result as {
								candidates?: Array<{
									finishReason?: string;
									content?: {
										parts?: Array<{
											text?: string;
											inlineData?: { mimeType: string; data: string };
										}>;
									};
								}>;
							}
						)?.candidates?.[0];

						// Check for prohibited content finish reason
						if (candidate?.finishReason === "PROHIBITED_CONTENT") {
							characterGenLogger.warn(
								{
									character_name: character.name,
									finish_reason: candidate.finishReason,
								},
								"Content blocked by safety filters",
							);
							throw new Error(
								"PROHIBITED_CONTENT: Your content was blocked by Gemini safety filters.",
								{ cause: result },
							);
						}

						if (!candidate?.content?.parts) {
							throw new Error("No content parts received", { cause: result });
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

						return undefined; // This function doesn't need to return anything
					},
					characterGenLogger,
					"image",
					{
						character_name: character.name,
						prompt_length: prompt.length,
						style_prefix: `${stylePrefix.substring(0, 50)}...`,
						matching_uploads: matchingUploads.length,
						total_uploads: uploadedCharacterReferences.length,
						input_parts_count: inputParts.length,
					},
					// Bedrock fallback parameters
					{
						messages: bedrockMessages,
						maxTokens: 4096,
						temperature: 0.7,
					},
				);

				// Handle response based on source
				if (typeof response === "object" && "source" in response) {
					// Response from Bedrock fallback
					const apiResponse = response as ApiResponse<unknown>;
					characterGenLogger.info(
						{
							character_name: character.name,
							source: apiResponse.source,
						},
						`Character reference generated using ${apiResponse.source}`,
					);

					if (apiResponse.source === "bedrock") {
						// Handle Stability AI response
						const stabilityResult = apiResponse.result;
						if (
							typeof stabilityResult === "object" &&
							stabilityResult !== null &&
							"image" in stabilityResult &&
							typeof stabilityResult.image === "string"
						) {
							// Stability AI returned an image
							characterReferences.push({
								name: character.name,
								image: stabilityResult.image,
								description: character.physicalDescription,
							});

							characterGenLogger.info(
								{
									character_name: character.name,
									image_size_kb: Math.round(
										(stabilityResult.image.length * 0.75) / 1024,
									),
									duration_ms: Date.now() - characterStartTime,
								},
								"Successfully generated character reference with Stability AI",
							);
						} else {
							throw new Error(
								"Unexpected Bedrock response format for image generation",
							);
						}
					}
				} else {
					characterGenLogger.info(
						{
							character_name: character.name,
							source: "gemini",
						},
						"Character reference generated using gemini",
					);
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
