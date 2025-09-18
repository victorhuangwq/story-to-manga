import { GoogleGenAI } from "@google/genai";
import { getGoogleAiApiKey } from "@/lib/api-keys";
import { callGeminiWithRetry } from "@/lib/gemini-helper";
import { panelLogger } from "@/lib/logger";
import type { UploadedSettingReference } from "@/types";

const genAI = new GoogleGenAI({ apiKey: getGoogleAiApiKey(false) });
const model = "gemini-2.5-flash-image-preview";

interface Panel {
	panelNumber: number;
	characters: string[];
	sceneDescription: string;
	dialogue: string;
	cameraAngle: string;
	visualMood: string;
}

interface CharacterReference {
	name: string;
	image?: string;
	description?: string;
}

interface Setting {
	timePeriod: string;
	location: string;
	mood: string;
}

interface GeneratedPanel {
	panelNumber: number;
	image: string;
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

export async function generatePanel(
	panel: Panel,
	characterReferences: CharacterReference[],
	setting: Setting,
	style: string,
	uploadedSettingReferences: UploadedSettingReference[] = [],
): Promise<GeneratedPanel> {
	const startTime = Date.now();

	panelLogger.debug(
		{
			panel_number: panel.panelNumber,
			characters: panel.characters,
			character_refs_count: characterReferences.length,
			uploaded_setting_refs_count: uploadedSettingReferences.length,
			style,
		},
		"Generating panel",
	);

	const stylePrefix =
		style === "manga"
			? "Japanese manga visual style (black and white with screentones), but with English text"
			: "American comic book style, full color, clean line art";

	const charactersInPanel = panel.characters
		.map((charName) => {
			const charRef = characterReferences.find((ref) => ref.name === charName);
			return charRef
				? `${charName} (matching the character design shown in reference image)`
				: charName;
		})
		.join(" and ");

	let prompt = `
Create a single comic panel in ${stylePrefix}.

Setting: ${setting.location}, ${setting.timePeriod}, mood: ${setting.mood}

Panel Details:
Panel ${panel.panelNumber}: ${panel.cameraAngle} shot of ${charactersInPanel}. Scene: ${panel.sceneDescription}. ${panel.dialogue ? `Dialogue: "${panel.dialogue}"` : "No dialogue."}. Mood: ${panel.visualMood}.

IMPORTANT: Use the character reference images provided to maintain visual consistency. Each character should match their appearance from the reference images exactly.
`;

	// Add setting reference instructions if available
	if (uploadedSettingReferences.length > 0) {
		prompt += `
IMPORTANT: Use the provided setting/environment reference images to guide the visual style, atmosphere, and environmental details of this panel. Incorporate the visual elements, lighting, and mood shown in the setting references while adapting them to the ${stylePrefix} aesthetic.
`;
	}

	prompt += `
The panel should include:
- Clear panel border
- Speech bubbles with dialogue text (if any) - IMPORTANT: If dialogue includes character attribution like "Character: 'text'", only put the spoken text in the speech bubble, NOT the character name
- Thought bubbles if needed
- Sound effects where appropriate
- Consistent character designs matching the references

Generate a single comic panel image with proper framing and composition.
`;

	// Prepare reference images for input
	const inputParts: Array<
		{ text: string } | { inlineData: { data: string; mimeType: string } }
	> = [{ text: prompt }];

	// Add character reference images
	characterReferences.forEach((charRef) => {
		if (charRef.image) {
			inputParts.push(prepareImageForGemini(charRef.image));
		}
	});

	// Add uploaded setting reference images
	uploadedSettingReferences.forEach((settingRef) => {
		if (settingRef.image) {
			inputParts.push(prepareImageForGemini(settingRef.image));
		}
	});

	panelLogger.info(
		{
			model: model,
			panel_number: panel.panelNumber,
			prompt_length: prompt.length,
			character_refs_attached: characterReferences.length,
			uploaded_setting_refs_attached: uploadedSettingReferences.length,
			input_parts_count: inputParts.length,
		},
		"Calling Gemini API for panel generation",
	);

	const result = await callGeminiWithRetry(
		async () => {
			const result = await genAI.models.generateContent({
				model: model,
				contents: inputParts,
			});

			panelLogger.debug(
				{
					panel_number: panel.panelNumber,
				},
				"Received response from Gemini API",
			);

			// Process the response following the official pattern
			const candidate = result.candidates?.[0];

			// Check for prohibited content finish reason
			if (candidate?.finishReason === "PROHIBITED_CONTENT") {
				panelLogger.warn(
					{
						panel_number: panel.panelNumber,
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

					panelLogger.info(
						{
							panel_number: panel.panelNumber,
							mime_type: mimeType,
							image_size_kb: imageData
								? Math.round((imageData.length * 0.75) / 1024)
								: 0,
							duration_ms: Date.now() - startTime,
						},
						"Successfully generated panel",
					);

					return {
						panelNumber: panel.panelNumber,
						image: `data:${mimeType};base64,${imageData}`,
					};
				}
			}

			throw new Error("No image data received in response parts");
		},
		panelLogger,
		{
			panel_number: panel.panelNumber,
			prompt_length: prompt.length,
			character_refs_attached: characterReferences.length,
			uploaded_setting_refs_attached: uploadedSettingReferences.length,
			input_parts_count: inputParts.length,
		},
	);

	return result;
}