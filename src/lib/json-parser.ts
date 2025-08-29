/**
 * Utility function to parse JSON from Gemini responses that might be wrapped in markdown code blocks
 */
export function parseGeminiJSON<T = object>(text: string): T {
	// Remove markdown code block formatting if present
	let cleanedText = text.trim();

	// Remove ```json prefix and ``` suffix if present
	if (cleanedText.startsWith("```json")) {
		cleanedText = cleanedText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
	} else if (cleanedText.startsWith("```")) {
		cleanedText = cleanedText.replace(/^```\s*/, "").replace(/\s*```$/, "");
	}

	// Try to parse the cleaned JSON
	try {
		return JSON.parse(cleanedText.trim()) as T;
	} catch (error) {
		// If parsing fails, try to extract JSON from the text
		const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			return JSON.parse(jsonMatch[0]) as T;
		}
		throw error;
	}
}
