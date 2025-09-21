import {
	BedrockRuntimeClient,
	InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { Logger } from "pino";
import {
	getAwsAccessKeyId,
	getAwsRegion,
	getAwsSecretAccessKey,
} from "./api-keys";

/**
 * Bedrock model constants
 */
const BEDROCK_TEXT_MODEL = "anthropic.claude-sonnet-4-20250514-v1:0";
const BEDROCK_IMAGE_MODEL = "stability.sd3-5-large-v1:0";

/**
 * Bedrock client configuration
 */
let bedrockClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
	if (!bedrockClient) {
		bedrockClient = new BedrockRuntimeClient({
			region: getAwsRegion(),
			credentials: {
				accessKeyId: getAwsAccessKeyId(),
				secretAccessKey: getAwsSecretAccessKey(),
			},
		});
	}
	return bedrockClient;
}

/**
 * Interface for Bedrock text generation request
 */
interface BedrockTextRequest {
	prompt: string;
	maxTokens?: number;
	temperature?: number;
	topP?: number;
}

/**
 * Interface for Bedrock multimodal request (text + images)
 */
interface BedrockMultimodalRequest {
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
}

/**
 * Wrapper function that calls Amazon Bedrock API with retry logic for transient failures
 */
export async function callBedrockWithRetry(
	request: BedrockTextRequest | BedrockMultimodalRequest,
	logger: Logger,
	generationType: "text" | "image",
	context: Record<string, unknown> = {},
): Promise<string | { image: string }> {
	const startTime = Date.now();
	const client = getBedrockClient();

	const attemptCall = async (
		attemptNumber: number,
	): Promise<string | { image: string }> => {
		// Use the explicitly specified generation type to determine model
		const modelId =
			generationType === "image" ? BEDROCK_IMAGE_MODEL : BEDROCK_TEXT_MODEL;

		logger.debug(
			{
				...context,
				attempt: attemptNumber,
				modelId,
				requestType: generationType,
			},
			"Calling Bedrock API",
		);

		try {
			// Prepare the request body based on model type
			let body: string;

			if (modelId.includes("anthropic.claude")) {
				// Claude models use the messages format
				if ("messages" in request) {
					// Multimodal request
					body = JSON.stringify({
						messages: request.messages,
						max_tokens: request.maxTokens || 4096,
						temperature: request.temperature || 0.7,
						top_p: request.topP || 0.9,
					});
				} else {
					// Text-only request - convert to messages format
					body = JSON.stringify({
						messages: [
							{
								role: "user",
								content: [
									{
										type: "text",
										text: request.prompt,
									},
								],
							},
						],
						max_tokens: request.maxTokens || 4096,
						temperature: request.temperature || 0.7,
						top_p: request.topP || 0.9,
					});
				}
			} else if (modelId.includes("meta.llama")) {
				// Llama models use different format
				body = JSON.stringify({
					prompt:
						"prompt" in request
							? request.prompt
							: extractPromptFromMessages(request.messages),
					max_gen_len: request.maxTokens || 2048,
					temperature: request.temperature || 0.7,
					top_p: request.topP || 0.9,
				});
			} else if (modelId.includes("stability.")) {
				// Stability AI models
				const promptText =
					"prompt" in request
						? request.prompt
						: extractPromptFromMessages(request.messages);
				body = JSON.stringify({
					prompt: promptText,
					mode: "text-to-image",
					output_format: "jpeg",
					aspect_ratio: "1:1",
					seed: Math.floor(Math.random() * 1000000),
				});
			} else if (modelId.includes("amazon.titan-image")) {
				// Titan image models
				throw new Error(
					"Image generation with Titan models not yet implemented",
				);
			} else {
				throw new Error(`Unsupported Bedrock model: ${modelId}`);
			}

			const command = new InvokeModelCommand({
				modelId: modelId,
				body: body,
				contentType: "application/json",
				accept: "application/json",
			});

			const response = await client.send(command);

			if (!response.body) {
				throw new Error("Empty response body from Bedrock");
			}

			const responseBody = JSON.parse(new TextDecoder().decode(response.body));

			// Extract response based on model type
			if (modelId.includes("anthropic.claude")) {
				if (responseBody.content?.[0]?.text) {
					const text = responseBody.content[0].text;
					logger.debug(
						{
							...context,
							attempt: attemptNumber,
							duration_ms: Date.now() - startTime,
							response_length: text.length,
						},
						"Bedrock API call successful",
					);
					return text;
				} else {
					throw new Error("Invalid Claude response format");
				}
			} else if (modelId.includes("meta.llama")) {
				if (responseBody.generation) {
					const text = responseBody.generation;
					logger.debug(
						{
							...context,
							attempt: attemptNumber,
							duration_ms: Date.now() - startTime,
							response_length: text.length,
						},
						"Bedrock API call successful",
					);
					return text;
				} else {
					throw new Error("Invalid Llama response format");
				}
			} else if (modelId.includes("stability.")) {
				if (responseBody.images?.[0]) {
					const imageBase64 = responseBody.images[0];
					logger.debug(
						{
							...context,
							attempt: attemptNumber,
							duration_ms: Date.now() - startTime,
							image_size_kb: Math.round((imageBase64.length * 0.75) / 1024),
						},
						"Bedrock image generation successful",
					);
					return { image: `data:image/jpeg;base64,${imageBase64}` };
				} else {
					throw new Error("Invalid Stability AI response format");
				}
			} else {
				throw new Error(
					`Response parsing not implemented for model: ${modelId}`,
				);
			}
		} catch (error) {
			// Add attempt info to the error for logging
			if (error instanceof Error) {
				logger.debug(
					{
						...context,
						attempt: attemptNumber,
						error_message: error.message,
						error_name: error.name,
						error_stack: error.stack,
						duration_ms: Date.now() - startTime,
					},
					"Bedrock API call failed",
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
					"Bedrock API call failed with non-Error object",
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
			const shouldRetry = isRetryableBedrockError(error);

			if (shouldRetry) {
				logger.warn(
					{
						...context,
						error_message:
							error instanceof Error ? error.message : "Unknown error",
						error_name: error instanceof Error ? error.name : undefined,
						duration_ms: Date.now() - startTime,
					},
					"First Bedrock attempt failed with transient error, retrying once",
				);

				// Wait 2 seconds before retry (slightly longer than Gemini)
				await new Promise((resolve) => setTimeout(resolve, 2000));

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
						"Bedrock retry also failed, giving up",
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
				duration_ms: Date.now() - startTime,
			},
			"Bedrock API call failed after retry attempts",
		);
		throw error;
	}
}

/**
 * Determines if a Bedrock error is retryable
 */
function isRetryableBedrockError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	// Check for specific AWS/Bedrock retryable errors
	const retryableMessages = [
		"ThrottlingException",
		"InternalServerException",
		"ServiceUnavailableException",
		"TimeoutError",
		"NetworkingError",
		"RequestTimeout",
		"TooManyRequestsException",
		"throttling",
		"timeout",
		"network error",
		"connection error",
		"Internal error",
	];

	const errorMessage = error.message.toLowerCase();
	for (const message of retryableMessages) {
		if (errorMessage.includes(message.toLowerCase())) {
			console.log("🔄 Detected retryable Bedrock error:", {
				message: error.message,
				name: error.name,
			});
			return true;
		}
	}

	// Check error name for AWS SDK specific errors
	if (
		error.name &&
		[
			"ThrottlingException",
			"InternalServerException",
			"ServiceUnavailableException",
			"TimeoutError",
		].includes(error.name)
	) {
		console.log("🔄 Detected retryable Bedrock error by name:", {
			name: error.name,
			message: error.message,
		});
		return true;
	}

	return false;
}

/**
 * Helper function to extract prompt from messages format (for Llama models)
 */
function extractPromptFromMessages(
	messages: Array<{
		role: string;
		content: Array<{ type: string; text?: string }>;
	}>,
): string {
	return messages
		.map((message) => {
			const textContent = message.content
				.filter((c) => c.type === "text" && c.text)
				.map((c) => c.text)
				.join(" ");
			return `${message.role}: ${textContent}`;
		})
		.join("\n");
}

/**
 * Helper function to convert base64 image to Bedrock format
 */
export function prepareImageForBedrock(base64Image: string) {
	// Remove data:image/xxx;base64, prefix if present
	const base64Data = base64Image.replace(/^data:image\/[^;]+;base64,/, "");
	return {
		format: "jpeg",
		source: {
			bytes: base64Data,
		},
	};
}
