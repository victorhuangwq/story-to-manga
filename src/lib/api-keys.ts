/**
 * Utility functions for managing API keys
 */

/**
 * Get the appropriate Google AI API key based on usage type
 * @param forTextGeneration - If true, prefer GOOGLE_AI_TEXT_API_KEY if available
 * @returns The API key to use
 */
export function getGoogleAiApiKey(forTextGeneration = false): string {
	if (forTextGeneration) {
		const textApiKey = process.env["GOOGLE_AI_TEXT_API_KEY"];
		if (textApiKey) {
			return textApiKey;
		}
	}

	const mainApiKey = process.env["GOOGLE_AI_API_KEY"];
	if (!mainApiKey) {
		throw new Error(
			"Neither GOOGLE_AI_API_KEY nor GOOGLE_AI_TEXT_API_KEY environment variable is set",
		);
	}

	return mainApiKey;
}
