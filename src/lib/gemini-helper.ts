import type { Logger } from "pino";

interface GeminiError {
	error?: {
		code?: number;
		status?: string;
		message?: string;
	};
}

/**
 * Wrapper function that calls Gemini API with retry logic for transient failures
 */
export async function callGeminiWithRetry<T>(
	apiCall: () => Promise<T>,
	logger: Logger,
	context: Record<string, unknown> = {},
): Promise<T> {
	const startTime = Date.now();

	const attemptCall = async (attemptNumber: number): Promise<T> => {
		logger.debug(
			{
				...context,
				attempt: attemptNumber,
			},
			"Calling Gemini API",
		);

		try {
			const result = await apiCall();

			logger.debug(
				{
					...context,
					attempt: attemptNumber,
					duration_ms: Date.now() - startTime,
				},
				"Gemini API call successful",
			);

			return result;
		} catch (error) {
			// Add attempt info to the error for logging
			if (error instanceof Error) {
				logger.debug(
					{
						...context,
						attempt: attemptNumber,
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
			return await attemptCall(1);
		} catch (error) {
			const shouldRetry = isRetryableError(error);

			if (shouldRetry) {
				logger.warn(
					{
						...context,
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
					return await attemptCall(2);
				} catch (retryError) {
					logger.error(
						{
							...context,
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
				// Re-throw non-retryable errors immediately
				throw error;
			}
		}
	} catch (error) {
		// Final error handling
		logger.error(
			{
				...context,
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
