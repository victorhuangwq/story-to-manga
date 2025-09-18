import { GoogleGenAI } from "@google/genai";
import { getGoogleAiApiKey } from "@/lib/api-keys";
import { callGeminiWithRetry } from "@/lib/gemini-helper";
import { characterGenLogger } from "@/lib/logger";
import type { UploadedCharacterReference } from "@/types";

const genAI = new GoogleGenAI({ apiKey: getGoogleAiApiKey(false) });
const model = "gemini-2.5-flash-image-preview";

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

interface CharacterReference {
	name: string;
	image: string;
	description: string;
}

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

export async function generateCharacterRef(
	character: Character,
	setting: Setting,
	style: string,
	uploadedCharacterReferences: UploadedCharacterReference[] = [],
): Promise<CharacterReference> {
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
		(ref) =>
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
	for (const upload of uploadedCharacterReferences) {
		if (upload.image) {
			inputParts.push(prepareImageForGemini(upload.image));
		}
	}

	const result = await callGeminiWithRetry(
		async () => {
			const result = await genAI.models.generateContent({
				model: model,
				contents: inputParts,
			});

			// Process the response following the official pattern
			const candidate = result.candidates?.[0];

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

			for (const part of candidate.content.parts) {
				if (part.inlineData) {
					const imageData = part.inlineData.data;
					const mimeType = part.inlineData.mimeType || "image/jpeg";

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

					return {
						name: character.name,
						image: `data:${mimeType};base64,${imageData}`,
						description: character.physicalDescription,
					};
				}
			}

			throw new Error("No image data received in response parts");
		},
		characterGenLogger,
		{
			character_name: character.name,
			prompt_length: prompt.length,
			style_prefix: `${stylePrefix.substring(0, 50)}...`,
			matching_uploads: matchingUploads.length,
			total_uploads: uploadedCharacterReferences.length,
			input_parts_count: inputParts.length,
		},
	);

	return result;
}