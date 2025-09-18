import { type NextRequest } from "next/server";
import { analyzeStory } from "@/lib/generation/story-analyzer";
import { chunkStory } from "@/lib/generation/story-chunker";
import { generateCharacterRef } from "@/lib/generation/character-generator";
import { generatePanel } from "@/lib/generation/panel-generator";
import { streamLogger } from "@/lib/logger";
import type {
	StoryAnalysis,
	StoryBreakdown,
	CharacterReference,
	GeneratedPanel,
	UploadedCharacterReference,
	UploadedSettingReference,
} from "@/types";

type StreamMessage =
	| { type: "status"; step: string; message: string }
	| { type: "analysis"; data: StoryAnalysis }
	| { type: "chunks"; data: StoryBreakdown }
	| { type: "character"; data: CharacterReference }
	| { type: "panel"; panelNumber: number; data: GeneratedPanel }
	| { type: "error"; step: string; message: string; retrying?: boolean }
	| { type: "complete"; totalPanels: number };

export async function POST(request: NextRequest) {
	const encoder = new TextEncoder();
	const startTime = Date.now();

	try {
		const {
			story,
			style,
			uploadedCharacterReferences = [],
			uploadedSettingReferences = [],
		} = await request.json();

		streamLogger.info(
			{
				story_length: story?.length || 0,
				style,
				uploaded_chars: uploadedCharacterReferences.length,
				uploaded_settings: uploadedSettingReferences.length,
			},
			"Starting streaming manga generation",
		);

		// Validate inputs
		if (!story || !style) {
			return new Response(
				JSON.stringify({ error: "Story and style are required" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// Validate story length
		const wordCount = story.trim().split(/\s+/).length;
		if (wordCount > 500) {
			return new Response(
				JSON.stringify({
					error: `Story too long. Maximum 500 words, got ${wordCount} words.`,
				}),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		const stream = new ReadableStream({
			async start(controller) {
				const send = (data: StreamMessage) => {
					const line = JSON.stringify(data) + "\n";
					controller.enqueue(encoder.encode(line));
				};

				// Helper function for single retry
				const retryOnce = async <T>(
					fn: () => Promise<T>,
					stepName: string,
				): Promise<T> => {
					try {
						return await fn();
					} catch (error) {
						streamLogger.warn(
							{ step: stepName, error: String(error) },
							"First attempt failed, retrying",
						);
						send({
							type: "status",
							step: "retry",
							message: `Retrying ${stepName}...`,
						});
						await new Promise((resolve) => setTimeout(resolve, 1000));

						try {
							return await fn();
						} catch (retryError) {
							streamLogger.error(
								{ step: stepName, error: String(retryError) },
								"Retry failed",
							);
							throw retryError;
						}
					}
				};

				try {
					// Step 1: Analyze story
					send({
						type: "status",
						step: "analysis",
						message: "Analyzing story...",
					});
					const analysis = await retryOnce(
						() => analyzeStory(story, style),
						"story analysis",
					);
					send({ type: "analysis", data: analysis });
					streamLogger.info(
						{
							title: analysis.title,
							characters: analysis.characters.length,
						},
						"Story analysis complete",
					);

					// Step 2: Chunk story
					send({
						type: "status",
						step: "chunks",
						message: "Breaking down story into panels...",
					});
					const chunks = await retryOnce(
						() => chunkStory(story, analysis.characters, analysis.setting, style),
						"story chunking",
					);
					send({ type: "chunks", data: chunks });
					streamLogger.info(
						{ panels: chunks.panels.length },
						"Story chunking complete",
					);

					// Step 3: Generate character references
					const characterReferences: CharacterReference[] = [];
					for (const character of analysis.characters) {
						send({
							type: "status",
							step: "character",
							message: `Creating ${character.name}...`,
						});
						try {
							const charRef = await retryOnce(
								() =>
									generateCharacterRef(
										character,
										analysis.setting,
										style,
										uploadedCharacterReferences as UploadedCharacterReference[],
									),
								`character generation for ${character.name}`,
							);
							characterReferences.push(charRef);
							send({ type: "character", data: charRef });
							streamLogger.info(
								{ character: character.name },
								"Character generation complete",
							);
						} catch (error) {
							streamLogger.error(
								{ character: character.name, error: String(error) },
								"Failed to generate character after retry",
							);
							send({
								type: "error",
								step: "character",
								message: `Failed to generate ${character.name}`,
							});
							// Continue with other characters
						}
					}

					// Step 4: Generate panels
					for (let i = 0; i < chunks.panels.length; i++) {
						const panel = chunks.panels[i];
						send({
							type: "status",
							step: "panel",
							message: `Generating panel ${i + 1}/${chunks.panels.length}...`,
						});
						try {
							const generatedPanel = await retryOnce(
								() =>
									generatePanel(
										panel,
										characterReferences,
										analysis.setting,
										style,
										uploadedSettingReferences as UploadedSettingReference[],
									),
								`panel ${i + 1}`,
							);
							send({ type: "panel", panelNumber: i, data: generatedPanel });
							streamLogger.info(
								{ panel: i + 1, total: chunks.panels.length },
								"Panel generation complete",
							);
						} catch (error) {
							streamLogger.error(
								{ panel: i + 1, error: String(error) },
								"Failed to generate panel after retry",
							);
							send({
								type: "error",
								step: "panel",
								message: `Failed to generate panel ${i + 1}`,
							});
							// Continue with other panels
						}
					}

					// Step 5: Complete
					send({ type: "complete", totalPanels: chunks.panels.length });
					streamLogger.info(
						{
							duration_ms: Date.now() - startTime,
							panels_generated: chunks.panels.length,
						},
						"Streaming generation complete",
					);
				} catch (error) {
					streamLogger.error(
						{ error: String(error) },
						"Critical error during streaming generation",
					);
					send({
						type: "error",
						step: "critical",
						message:
							error instanceof Error ? error.message : "Generation failed",
					});
				} finally {
					controller.close();
				}
			},

			cancel() {
				streamLogger.info(
					{ duration_ms: Date.now() - startTime },
					"Stream cancelled by client",
				);
			},
		});

		return new Response(stream, {
			headers: {
				"Content-Type": "application/x-ndjson",
				"Cache-Control": "no-cache",
				"X-Content-Type-Options": "nosniff",
			},
		});
	} catch (error) {
		streamLogger.error(
			{ error: String(error) },
			"Failed to initialize streaming generation",
		);
		return new Response(
			JSON.stringify({ error: "Failed to initialize generation" }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
}