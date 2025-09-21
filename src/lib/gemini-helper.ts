import type { GoogleGenAI } from "@google/genai";
import type { Logger } from "pino";
import { callBedrockWithRetry } from "./bedrock-helper";

/**
 * Gemini model constants (internal use only)
 */
const GEMINI_TEXT_MODEL = "gemini-2.5-flash";
const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image-preview";

/**
 * Gets the appropriate Gemini model based on generation type
 */
function getGeminiModel(generationType: "text" | "image"): string {
	return generationType === "image" ? GEMINI_IMAGE_MODEL : GEMINI_TEXT_MODEL;
}

interface GeminiError {
	error?: {
		code?: number;
		status?: string;
		message?: string;
	};
}

/**
 * Response from API call with source information
 */
export interface ApiResponse<T = string> {
	result: T;
	source: "gemini" | "bedrock";
}

/**
 * Parameters for Bedrock fallback
 */
type BedrockFallbackParams =
	| {
			prompt: string;
			maxTokens?: number;
			temperature?: number;
			topP?: number;
	  }
	| {
			messages: Array<{
				role: string;
				content: Array<{
					type: string;
					text?: string;
					image?: {
						format: string;
						source: {
							bytes: string;
						};
					};
				}>;
			}>;
			maxTokens?: number;
			temperature?: number;
			topP?: number;
	  };

/**
 * Wrapper function that calls Gemini API with retry logic for transient failures
 * Falls back to Bedrock if Gemini fails with non-retryable errors
 */
export async function callGeminiWithRetry<T>(
	genAI: GoogleGenAI,
	contents:
		| string
		| Array<
				{ text: string } | { inlineData: { data: string; mimeType: string } }
		  >,
	config: Record<string, unknown> | undefined,
	processResponse: (result: unknown) => T,
	logger: Logger,
	generationType: "text" | "image",
	context: Record<string, unknown> = {},
	bedrockFallback?: BedrockFallbackParams,
): Promise<T | ApiResponse<T>> {
	const startTime = Date.now();

	// Use the explicitly specified generation type to determine model
	const model = getGeminiModel(generationType);

	const attemptCall = async (attemptNumber: number): Promise<T> => {
		logger.debug(
			{
				...context,
				attempt: attemptNumber,
				model: model,
				contentType: typeof contents === "string" ? "text" : "multipart",
			},
			"Calling Gemini API",
		);

		try {
			const generateParams: {
				model: string;
				contents:
					| string
					| Array<
							| { text: string }
							| { inlineData: { data: string; mimeType: string } }
					  >;
				config?: Record<string, unknown>;
			} = {
				model: model,
				contents: contents,
			};

			if (config) {
				generateParams.config = config;
			}

			const result = await genAI.models.generateContent(generateParams);

			const processedResult = processResponse(result);

			logger.debug(
				{
					...context,
					attempt: attemptNumber,
					model: model,
					duration_ms: Date.now() - startTime,
				},
				"Gemini API call successful",
			);

			return processedResult;
		} catch (error) {
			// Add attempt info to the error for logging
			if (error instanceof Error) {
				logger.debug(
					{
						...context,
						attempt: attemptNumber,
						model: model,
						error_message: error.message,
						error_cause: error.cause,
						error_name: error.name,
						error_constructor: error.constructor.name,
						error_stack: error.stack,
						duration_ms: Date.now() - startTime,
					},
					"Gemini API call failed",
				);
			} else {
				logger.debug(
					{
						...context,
						attempt: attemptNumber,
						model: model,
						error_type: typeof error,
						error_value: error,
						duration_ms: Date.now() - startTime,
					},
					"Gemini API call failed with non-Error object",
				);
			}
			throw error;
		}
	};

	try {
		// Try first attempt
		try {
			const result = await attemptCall(1);
			// Return successful Gemini result
			return {
				result: result,
				source: "gemini",
			} as ApiResponse<T>;
		} catch (error) {
			const shouldRetry = isRetryableError(error);

			if (shouldRetry) {
				logger.warn(
					{
						...context,
						model: model,
						error_message:
							error instanceof Error ? error.message : "Unknown error",
						error_cause: error instanceof Error ? error.cause : undefined,
						error_name: error instanceof Error ? error.name : undefined,
						is_json_error:
							error instanceof Error && error.message.includes('{"error":{'),
						duration_ms: Date.now() - startTime,
					},
					"First attempt failed with transient error, retrying once",
				);

				// Wait 1.5 seconds before retry
				await new Promise((resolve) => setTimeout(resolve, 1500));

				try {
					const retryResult = await attemptCall(2);
					// Return successful Gemini retry result
					return {
						result: retryResult,
						source: "gemini",
					} as ApiResponse<T>;
				} catch (retryError) {
					logger.error(
						{
							...context,
							model: model,
							original_error:
								error instanceof Error ? error.message : "Unknown error",
							retry_error:
								retryError instanceof Error
									? retryError.message
									: "Unknown error",
							duration_ms: Date.now() - startTime,
						},
						"Retry also failed, giving up",
					);
					throw retryError;
				}
			} else {
				// Try Bedrock fallback for non-retryable errors
				if (bedrockFallback) {
					logger.warn(
						{
							...context,
							model: model,
							error_message:
								error instanceof Error ? error.message : "Unknown error",
							duration_ms: Date.now() - startTime,
						},
						"Gemini failed with non-retryable error, attempting Bedrock fallback",
					);
					try {
						const bedrockResult = await callBedrockWithRetry(
							bedrockFallback,
							logger,
							generationType,
							context,
						);
						logger.info(
							{
								...context,
								duration_ms: Date.now() - startTime,
							},
							"Bedrock fallback successful",
						);
						return {
							result: bedrockResult as T,
							source: "bedrock",
						} as ApiResponse<T>;
					} catch (bedrockError) {
						logger.error(
							{
								...context,
								model: model,
								original_error:
									error instanceof Error ? error.message : "Unknown error",
								bedrock_error:
									bedrockError instanceof Error
										? bedrockError.message
										: "Unknown error",
								duration_ms: Date.now() - startTime,
							},
							"Both Gemini and Bedrock failed",
						);
						throw error; // Throw original Gemini error
					}
				}
				// Re-throw non-retryable errors immediately if no fallback
				throw error;
			}
		}
	} catch (error) {
		// Try Bedrock fallback if available and this wasn't already a fallback attempt
		if (bedrockFallback && !("__bedrockAttempted" in (error as object))) {
			logger.warn(
				{
					...context,
					model: model,
					error_message:
						error instanceof Error ? error.message : "Unknown error",
					duration_ms: Date.now() - startTime,
				},
				"Gemini retry attempts failed, attempting Bedrock fallback",
			);
			try {
				const bedrockResult = await callBedrockWithRetry(
					bedrockFallback,
					logger,
					generationType,
					context,
				);
				logger.info(
					{
						...context,
						duration_ms: Date.now() - startTime,
					},
					"Bedrock fallback successful after Gemini retry failure",
				);
				return {
					result: bedrockResult as T,
					source: "bedrock",
				} as ApiResponse<T>;
			} catch (bedrockError) {
				logger.error(
					{
						...context,
						model: model,
						original_error:
							error instanceof Error ? error.message : "Unknown error",
						bedrock_error:
							bedrockError instanceof Error
								? bedrockError.message
								: "Unknown error",
						duration_ms: Date.now() - startTime,
					},
					"Both Gemini retries and Bedrock fallback failed",
				);
				throw error; // Throw original Gemini error
			}
		}

		// Final error handling - no fallback available or fallback already attempted
		logger.error(
			{
				...context,
				model: model,
				error_message: error instanceof Error ? error.message : "Unknown error",
				error_cause: error instanceof Error ? error.cause : undefined,
				duration_ms: Date.now() - startTime,
			},
			"Gemini API call failed after retry attempts",
		);
		throw error;
	}
}

/**
 * Determines if an error is retryable based on error type and content
 */
function isRetryableError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	// Don't retry prohibited content errors
	if (error.message.startsWith("PROHIBITED_CONTENT:")) {
		return false;
	}

	// Check for specific error messages that indicate transient failures
	const retryableMessages = [
		"No content parts received",
		"fetch failed",
		"network error",
		"timeout",
		"Internal error encountered",
	];

	for (const message of retryableMessages) {
		if (error.message.includes(message)) {
			return true;
		}
	}

	// Check for JSON-formatted Gemini API errors in error message
	// The ApiError from @google/genai throws errors with JSON string messages
	if (error.message.includes('{"error":{')) {
		try {
			const errorObj = JSON.parse(error.message);
			if (
				errorObj.error &&
				errorObj.error.code === 500 &&
				errorObj.error.status === "INTERNAL"
			) {
				console.log("🔄 Detected retryable JSON error:", {
					code: errorObj.error.code,
					status: errorObj.error.status,
					message: errorObj.error.message,
				});
				return true;
			}
		} catch {
			console.log("⚠️ Failed to parse JSON error message:", error.message);
		}
	}

	// Check for Gemini API Internal errors (code 500, status INTERNAL)
	if (error.cause && typeof error.cause === "object") {
		const cause = error.cause as GeminiError;
		if (
			cause.error &&
			typeof cause.error === "object" &&
			cause.error.code === 500 &&
			cause.error.status === "INTERNAL"
		) {
			console.log("🔄 Detected retryable cause error:", {
				code: cause.error.code,
				status: cause.error.status,
				message: cause.error.message,
			});
			return true;
		}
	}

	return false;
}
