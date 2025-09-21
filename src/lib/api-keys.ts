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

/**
 * Get AWS Access Key ID for Bedrock API calls
 * @returns AWS Access Key ID
 */
export function getAwsAccessKeyId(): string {
	const accessKeyId = process.env["AWS_ACCESS_KEY_ID"];
	if (!accessKeyId) {
		throw new Error("AWS_ACCESS_KEY_ID environment variable is not set");
	}
	return accessKeyId;
}

/**
 * Get AWS Secret Access Key for Bedrock API calls
 * @returns AWS Secret Access Key
 */
export function getAwsSecretAccessKey(): string {
	const secretAccessKey = process.env["AWS_SECRET_ACCESS_KEY"];
	if (!secretAccessKey) {
		throw new Error("AWS_SECRET_ACCESS_KEY environment variable is not set");
	}
	return secretAccessKey;
}

/**
 * Get AWS Region for Bedrock API calls
 * @returns AWS Region (defaults to us-west-2 if not specified)
 */
export function getAwsRegion(): string {
	return process.env["AWS_REGION"] || "us-west-2";
}
