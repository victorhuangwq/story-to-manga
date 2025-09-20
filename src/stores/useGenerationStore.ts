import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
	trackError,
	trackEvent,
	trackMangaGeneration,
	trackPerformance,
} from "@/lib/analytics";
import { useUIStore } from "@/stores/useUIStore";
import type {
	CharacterReference,
	ComicStyle,
	GeneratedPanel,
	StoryAnalysis,
	StoryBreakdown,
	UploadedCharacterReference,
	UploadedSettingReference,
} from "@/types";

type FailedStep = "analysis" | "characters" | "layout" | "panels" | null;
type FailedPanel = { step: "panel"; panelNumber: number } | null;

// IndexedDB setup for images
const DB_NAME = "MangaGeneratorDB";
const DB_VERSION = 1;
const IMAGE_STORE = "images";

class ImageStorage {
	private db: IDBDatabase | null = null;

	async init(): Promise<void> {
		if (typeof window === "undefined") return Promise.resolve();
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				this.db = request.result;
				resolve();
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains(IMAGE_STORE)) {
					db.createObjectStore(IMAGE_STORE, { keyPath: "id" });
				}
			};
		});
	}

	async storeImage(id: string, imageData: string): Promise<void> {
		if (!this.db) await this.init();

		return new Promise((resolve, reject) => {
			if (!this.db) {
				reject(new Error("Database not initialized"));
				return;
			}

			const transaction = this.db.transaction([IMAGE_STORE], "readwrite");
			const store = transaction.objectStore(IMAGE_STORE);
			const request = store.put({ id, imageData, timestamp: Date.now() });

			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}

	async getImage(id: string): Promise<string | null> {
		if (!this.db) await this.init();

		return new Promise((resolve, reject) => {
			if (!this.db) {
				reject(new Error("Database not initialized"));
				return;
			}

			const transaction = this.db.transaction([IMAGE_STORE], "readonly");
			const store = transaction.objectStore(IMAGE_STORE);
			const request = store.get(id);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				const result = request.result;
				resolve(result ? result.imageData : null);
			};
		});
	}

	async clear(): Promise<void> {
		if (!this.db) await this.init();

		return new Promise((resolve, reject) => {
			if (!this.db) {
				reject(new Error("Database not initialized"));
				return;
			}

			const transaction = this.db.transaction([IMAGE_STORE], "readwrite");
			const store = transaction.objectStore(IMAGE_STORE);
			const request = store.clear();

			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}
}

// Single instance
const imageStorage = new ImageStorage();

// Reusable character generation helper to avoid code duplication
const generateSingleCharacterWithApi = async (
	characterData: {
		name: string;
		physicalDescription: string;
		personality: string;
		role: string;
	},
	setting: { timePeriod: string; location: string; mood: string },
	style: ComicStyle,
	uploadedCharacterReferences: UploadedCharacterReference[],
): Promise<CharacterReference> => {
	const response = await fetch("/api/generate-character-refs", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			characters: [characterData], // Singleton array
			setting,
			style,
			uploadedCharacterReferences,
		}),
	});

	if (!response.ok) {
		const errorMessage = await handleApiError(
			response,
			`Failed to generate character ${characterData.name}`,
		);
		throw new Error(errorMessage);
	}

	const { characterReferences } = await response.json();
	return characterReferences[0];
};

// Reusable panel generation helper to avoid code duplication
const generateSinglePanelWithApi = async (
	panelData: {
		panelNumber: number;
		characters: string[];
		sceneDescription: string;
		dialogue?: string;
		cameraAngle: string;
		visualMood: string;
	},
	characterReferences: CharacterReference[],
	setting: { timePeriod: string; location: string; mood: string },
	style: ComicStyle,
	uploadedSettingReferences: UploadedSettingReference[],
): Promise<GeneratedPanel> => {
	const panelResponse = await fetch("/api/generate-panel", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			panel: panelData,
			characterReferences,
			setting,
			style,
			uploadedSettingReferences,
		}),
	});

	if (!panelResponse.ok) {
		const errorMessage = await handleApiError(
			panelResponse,
			`Failed to generate panel ${panelData.panelNumber}`,
		);
		throw new Error(errorMessage);
	}

	const { generatedPanel } = await panelResponse.json();
	return generatedPanel;
};

// Enhanced API Error Helper with better context
const handleApiError = async (
	response: Response,
	defaultMessage: string,
	context?: string,
): Promise<string> => {
	let errorMessage = defaultMessage;

	try {
		const errorData = await response.json();
		if (errorData.error) {
			errorMessage = errorData.error;
		} else if (errorData.message) {
			errorMessage = errorData.message;
		}
	} catch {
		// If JSON parsing fails, use response status
		if (response.status === 429) {
			errorMessage =
				"Rate limit exceeded. Please wait a moment before retrying.";
		} else if (response.status === 500) {
			errorMessage =
				"Server error occurred. Please try again or contact support if the issue persists.";
		} else if (response.status === 413) {
			errorMessage =
				"Request too large. Please try with a shorter story or fewer uploaded images.";
		} else if (response.status >= 500) {
			errorMessage = "Server error occurred. Please try again later.";
		} else if (response.status >= 400) {
			errorMessage = "Request failed. Please check your input and try again.";
		}
	}

	// Add context if provided
	if (context) {
		errorMessage = `${context}: ${errorMessage}`;
	}

	return errorMessage;
};

// Error categorization helper
const categorizeError = (
	error: string,
): {
	category: "network" | "rate_limit" | "validation" | "generation" | "unknown";
	suggestion: string;
} => {
	const errorLower = error.toLowerCase();

	if (errorLower.includes("rate limit") || errorLower.includes("429")) {
		return {
			category: "rate_limit",
			suggestion:
				"Wait a few moments and try again. Consider upgrading for higher limits.",
		};
	}

	if (
		errorLower.includes("network") ||
		errorLower.includes("connection") ||
		errorLower.includes("timeout")
	) {
		return {
			category: "network",
			suggestion: "Check your internet connection and try again.",
		};
	}

	if (
		errorLower.includes("validation") ||
		errorLower.includes("invalid") ||
		errorLower.includes("required")
	) {
		return {
			category: "validation",
			suggestion:
				"Please check your input and ensure all required fields are filled correctly.",
		};
	}

	if (
		errorLower.includes("generate") ||
		errorLower.includes("failed to create") ||
		errorLower.includes("analysis")
	) {
		return {
			category: "generation",
			suggestion:
				"Try again with different wording or a simpler story structure.",
		};
	}

	return {
		category: "unknown",
		suggestion: "Please try again. Contact support if the issue persists.",
	};
};

interface GenerationState {
	storyAnalysis: StoryAnalysis | null;
	characterReferences: CharacterReference[];
	storyBreakdown: StoryBreakdown | null;
	generatedPanels: GeneratedPanel[];
	error: string | null;
	errorCategory:
		| "network"
		| "rate_limit"
		| "validation"
		| "generation"
		| "unknown"
		| null;
	errorSuggestion: string | null;
	failedStep: FailedStep;
	failedPanel: FailedPanel;
	isGenerating: boolean;
	currentStepText: string;
	openAccordions: Set<string>;
	// Store original inputs for retry functionality
	originalStoryText: string;
	originalStyle: ComicStyle;
	originalNoDialogue: boolean;
	originalUploadedCharacterReferences: UploadedCharacterReference[];
	originalUploadedSettingReferences: UploadedSettingReference[];
}

interface GenerationActions {
	// State setters
	setStoryAnalysis: (analysis: StoryAnalysis | null) => void;
	setCharacterReferences: (references: CharacterReference[]) => Promise<void>;
	setStoryBreakdown: (breakdown: StoryBreakdown | null) => void;
	setGeneratedPanels: (panels: GeneratedPanel[]) => Promise<void>;
	addGeneratedPanel: (panel: GeneratedPanel) => Promise<void>;
	updateGeneratedPanel: (
		panelNumber: number,
		panel: GeneratedPanel,
	) => Promise<void>;
	setError: (error: string | null) => void;
	setErrorWithContext: (error: string | null, context?: string) => void;
	setFailedStep: (step: FailedStep) => void;
	setFailedPanel: (panel: FailedPanel) => void;
	setIsGenerating: (isGenerating: boolean) => void;
	setCurrentStepText: (text: string) => void;
	setOpenAccordions: (accordions: Set<string>) => void;
	toggleGenerationAccordion: (section: string) => void;
	collapseAllGenerationAccordions: () => void;
	expandAllGenerationAccordions: () => void;
	// Business logic actions
	generateComic: (
		storyText: string,
		style: ComicStyle,
		noDialogue: boolean,
		uploadedCharacterReferences: UploadedCharacterReference[],
		uploadedSettingReferences: UploadedSettingReference[],
		startFromStep?: FailedStep,
		startFromPanelIndex?: number,
	) => Promise<void>;
	retryFromStep: (step: FailedStep) => Promise<void>;
	retryFailedPanel: (panelNumber: number, panelIndex: number) => Promise<void>;
	regeneratePanel: (panelNumber: number) => Promise<void>;
	regenerateCharacter: (characterName: string) => Promise<void>;
	updateCharacterReference: (
		characterName: string,
		newCharacter: CharacterReference,
	) => Promise<void>;
	// Utility actions
	resetGeneration: () => void;
	clearResults: () => void;
	showError: (message: string) => void;
	// Image persistence actions
	hydrateImages: () => Promise<void>;
	persistImages: () => Promise<void>;
	clearAllData: () => Promise<void>;
}

const initialState: GenerationState = {
	storyAnalysis: null,
	characterReferences: [],
	storyBreakdown: null,
	generatedPanels: [],
	error: null,
	errorCategory: null,
	errorSuggestion: null,
	failedStep: null,
	failedPanel: null,
	isGenerating: false,
	currentStepText: "",
	openAccordions: new Set<string>(),
	originalStoryText: "",
	originalStyle: "manga",
	originalNoDialogue: false,
	originalUploadedCharacterReferences: [],
	originalUploadedSettingReferences: [],
};

export const useGenerationStore = create<GenerationState & GenerationActions>()(
	persist(
		(set, _get) => ({
			...initialState,
			setStoryAnalysis: (storyAnalysis) => set({ storyAnalysis }),
			setCharacterReferences: async (characterReferences) => {
				set({ characterReferences });
				try {
					await imageStorage.init();
					for (const char of characterReferences) {
						if (char.image) {
							await imageStorage.storeImage(`char-${char.name}`, char.image);
						}
					}
				} catch (error) {
					console.warn("Failed to persist character images:", error);
				}
			},
			setStoryBreakdown: (storyBreakdown) => set({ storyBreakdown }),
			setGeneratedPanels: async (generatedPanels) => {
				set({ generatedPanels });
				try {
					await imageStorage.init();
					for (const panel of generatedPanels) {
						if (panel.image) {
							await imageStorage.storeImage(
								`panel-${panel.panelNumber}`,
								panel.image,
							);
						}
					}
				} catch (error) {
					console.warn("Failed to persist panel images:", error);
				}
			},
			addGeneratedPanel: async (panel) => {
				set((state) => ({
					generatedPanels: [...state.generatedPanels, panel].sort(
						(a, b) => a.panelNumber - b.panelNumber,
					),
				}));
				try {
					if (panel.image) {
						await imageStorage.init();
						await imageStorage.storeImage(
							`panel-${panel.panelNumber}`,
							panel.image,
						);
					}
				} catch (error) {
					console.warn(
						`Failed to persist panel ${panel.panelNumber} image:`,
						error,
					);
				}
			},
			updateGeneratedPanel: async (panelNumber, panel) => {
				set((state) => {
					const updatedPanels = [...state.generatedPanels];
					const existingIndex = updatedPanels.findIndex(
						(p) => p.panelNumber === panelNumber,
					);
					if (existingIndex >= 0) {
						updatedPanels[existingIndex] = panel;
					} else {
						updatedPanels.push(panel);
						updatedPanels.sort((a, b) => a.panelNumber - b.panelNumber);
					}
					return { generatedPanels: updatedPanels };
				});
				try {
					if (panel.image) {
						await imageStorage.init();
						await imageStorage.storeImage(
							`panel-${panel.panelNumber}`,
							panel.image,
						);
					}
				} catch (error) {
					console.warn(
						`Failed to persist panel ${panel.panelNumber} image:`,
						error,
					);
				}
			},
			setError: (error) =>
				set({ error, errorCategory: null, errorSuggestion: null }),
			setErrorWithContext: (error, context) => {
				if (!error) {
					set({ error: null, errorCategory: null, errorSuggestion: null });
					return;
				}

				const contextualError = context ? `${context}: ${error}` : error;
				const { category, suggestion } = categorizeError(contextualError);

				set({
					error: contextualError,
					errorCategory: category,
					errorSuggestion: suggestion,
				});

				// Also show error in modal
				const uiStore = useUIStore.getState();
				uiStore.showError(contextualError);

				// Track error with additional context
				trackError(
					"enhanced_error",
					`${contextualError} [${category}] ${context || "unknown"}`,
				);
			},
			setFailedStep: (failedStep) => set({ failedStep }),
			setFailedPanel: (failedPanel) => set({ failedPanel }),
			setIsGenerating: (isGenerating) => set({ isGenerating }),
			setCurrentStepText: (currentStepText) => set({ currentStepText }),
			setOpenAccordions: (openAccordions) => set({ openAccordions }),
			toggleGenerationAccordion: (section) =>
				set((state) => {
					const newAccordions = new Set(state.openAccordions);
					if (newAccordions.has(section)) {
						newAccordions.delete(section);
					} else {
						newAccordions.add(section);
					}
					return { openAccordions: newAccordions };
				}),
			collapseAllGenerationAccordions: () => set({ openAccordions: new Set() }),
			expandAllGenerationAccordions: () =>
				set({
					openAccordions: new Set([
						"analysis",
						"characters",
						"layout",
						"panels",
						"compositor",
					]),
				}),
			resetGeneration: () => set(initialState),
			clearResults: () =>
				set({
					storyAnalysis: null,
					characterReferences: [],
					storyBreakdown: null,
					generatedPanels: [],
					error: null,
					errorCategory: null,
					errorSuggestion: null,
					failedStep: null,
					failedPanel: null,
				}),

			// Show error helper
			showError: (message) => set({ error: message }),

			// Image persistence methods
			hydrateImages: async () => {
				try {
					const state = _get();
					await imageStorage.init();

					// Restore character images
					const characterReferences: CharacterReference[] = [];
					for (const char of state.characterReferences) {
						try {
							const image = await imageStorage.getImage(`char-${char.name}`);
							if (image) {
								characterReferences.push({ ...char, image });
							} else {
								// Keep character without image if image not found
								characterReferences.push({ ...char, image: "" });
							}
						} catch (error) {
							console.warn(
								`Failed to load image for character ${char.name}:`,
								error,
							);
							characterReferences.push({ ...char, image: "" });
						}
					}

					// Restore panel images
					const generatedPanels: GeneratedPanel[] = [];
					for (const panel of state.generatedPanels) {
						try {
							const image = await imageStorage.getImage(
								`panel-${panel.panelNumber}`,
							);
							if (image) {
								generatedPanels.push({ ...panel, image });
							} else {
								// Keep panel without image if image not found
								generatedPanels.push({ ...panel, image: "" });
							}
						} catch (error) {
							console.warn(
								`Failed to load image for panel ${panel.panelNumber}:`,
								error,
							);
							generatedPanels.push({ ...panel, image: "" });
						}
					}

					set({ characterReferences, generatedPanels });
				} catch (error) {
					console.error("Failed to hydrate images:", error);
				}
			},

			persistImages: async () => {
				try {
					const state = _get();
					await imageStorage.init();

					// Persist character images
					for (const char of state.characterReferences) {
						if (char.image) {
							await imageStorage.storeImage(`char-${char.name}`, char.image);
						}
					}

					// Persist panel images
					for (const panel of state.generatedPanels) {
						if (panel.image) {
							await imageStorage.storeImage(
								`panel-${panel.panelNumber}`,
								panel.image,
							);
						}
					}
				} catch (error) {
					console.error("Failed to persist images:", error);
					throw error;
				}
			},

			clearAllData: async () => {
				try {
					set(initialState);
					await imageStorage.clear();
				} catch (error) {
					console.error("Failed to clear all data:", error);
					throw error;
				}
			},

			// Main generation flow
			generateComic: async (
				storyText,
				style,
				noDialogue,
				uploadedCharacterReferences,
				uploadedSettingReferences,
				startFromStep = null,
				startFromPanelIndex = 0,
			) => {
				const state = _get();

				if (!storyText.trim()) {
					set({ error: "Please enter a story" });
					return;
				}

				const storyWordCount = storyText
					.split(/\s+/)
					.filter((word) => word.length > 0).length;
				if (storyWordCount > 500) {
					set({ error: "Story must be 500 words or less" });
					return;
				}

				// Store original inputs for retry functionality
				set({
					originalStoryText: storyText,
					originalStyle: style,
					originalNoDialogue: noDialogue,
					originalUploadedCharacterReferences: uploadedCharacterReferences,
					originalUploadedSettingReferences: uploadedSettingReferences,
				});

				// Clear previous results only if starting from beginning
				if (!startFromStep) {
					state.clearResults();
				}

				// Track generation progress
				let currentStep: FailedStep = startFromStep;
				const generationStartTime = Date.now();

				if (!startFromStep) {
					trackEvent({
						action: "start_generation",
						category: "manga_generation",
						label: style,
						value: storyWordCount,
					});
				}

				set({
					isGenerating: true,
					error: null,
					failedStep: null,
					failedPanel: null,
				});

				try {
					let analysis = state.storyAnalysis;
					let characterReferences = state.characterReferences;
					let breakdown = state.storyBreakdown;

					// Step 1: Analyze story (skip if starting from later step and we have analysis)
					if (!startFromStep || startFromStep === "analysis" || !analysis) {
						currentStep = "analysis";
						set({ currentStepText: "Analyzing your story..." });
						const analysisResponse = await fetch("/api/analyze-story", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ story: storyText, style }),
						});

						if (!analysisResponse.ok) {
							throw new Error(
								await handleApiError(
									analysisResponse,
									"Failed to analyze story",
								),
							);
						}

						const { analysis: newAnalysis } = await analysisResponse.json();
						analysis = newAnalysis;
						set({
							storyAnalysis: analysis,
							openAccordions: new Set(["analysis"]),
						});
					}

					// Step 2: Generate character references (skip if we already have them and not retrying from this step)
					if (
						!startFromStep ||
						startFromStep === "analysis" ||
						startFromStep === "characters" ||
						!characterReferences.length
					) {
						if (!analysis) {
							throw new Error(
								"Story analysis is required for character generation",
							);
						}

						currentStep = "characters";

						// Generate characters one by one to show progress
						characterReferences = [];
						for (let i = 0; i < analysis.characters.length; i++) {
							const character = analysis.characters[i];
							if (!character) continue;

							set({
								currentStepText: `Creating character ${i + 1}/${analysis.characters.length}: ${character.name}...`,
							});

							try {
								const generatedCharacter = await generateSingleCharacterWithApi(
									character,
									analysis.setting,
									style,
									uploadedCharacterReferences,
								);

								characterReferences.push(generatedCharacter);
								await _get().setCharacterReferences([...characterReferences]);

								// Auto-expand characters section after first character
								if (i === 0) {
									set({ openAccordions: new Set(["characters"]) });
								}
							} catch (error) {
								const errorMessage =
									error instanceof Error
										? error.message
										: `Failed to generate character ${character.name}`;
								trackError(
									"character_generation_failed",
									`Character ${character.name}: ${errorMessage}`,
								);
								throw new Error(errorMessage);
							}
						}
					}

					// Step 3: Break down story into panels (skip if we already have breakdown and not retrying from this step)
					if (
						!startFromStep ||
						startFromStep === "analysis" ||
						startFromStep === "characters" ||
						startFromStep === "layout" ||
						!breakdown
					) {
						if (!analysis) {
							throw new Error(
								"Story analysis is required for layout generation",
							);
						}

						currentStep = "layout";
						set({ currentStepText: "Planning comic layout..." });
						const storyBreakdownResponse = await fetch("/api/chunk-story", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								story: storyText,
								characters: analysis.characters,
								setting: analysis.setting,
								style,
								noDialogue,
							}),
						});

						if (!storyBreakdownResponse.ok) {
							throw new Error(
								await handleApiError(
									storyBreakdownResponse,
									"Failed to break down story",
								),
							);
						}

						const { storyBreakdown: newBreakdown } =
							await storyBreakdownResponse.json();
						breakdown = newBreakdown;
						set({
							storyBreakdown: breakdown,
							openAccordions: new Set(["layout"]),
						});
					}

					// Step 4: Generate comic panels
					if (
						!startFromStep ||
						startFromStep === "analysis" ||
						startFromStep === "characters" ||
						startFromStep === "layout" ||
						startFromStep === "panels"
					) {
						if (!breakdown || !analysis) {
							throw new Error(
								"Story breakdown and analysis are required for panel generation",
							);
						}

						currentStep = "panels";

						// Start with existing panels if any
						const existingPanels = state.generatedPanels || [];
						const panels: GeneratedPanel[] = [...existingPanels];

						// Determine starting index - either from parameter or from existing panels
						const startIndex =
							startFromStep === "panels" &&
							typeof startFromPanelIndex === "number"
								? startFromPanelIndex
								: existingPanels.length;

						for (let i = startIndex; i < breakdown!.panels.length; i++) {
							const panel = breakdown!.panels[i];
							set({
								currentStepText: `Generating panel ${i + 1}/${breakdown!.panels.length}...`,
							});

							try {
								const generatedPanel = await generateSinglePanelWithApi(
									panel!,
									characterReferences,
									analysis.setting,
									style,
									uploadedSettingReferences,
								);

								// Replace existing panel or add new one
								const existingIndex = panels.findIndex(
									(p) => p.panelNumber === generatedPanel.panelNumber,
								);
								if (existingIndex >= 0) {
									panels[existingIndex] = generatedPanel;
								} else {
									panels.push(generatedPanel);
									panels.sort((a, b) => a.panelNumber - b.panelNumber);
								}

								await _get().setGeneratedPanels([...panels]);

								// Auto-expand panels section after first panel
								if (i === 0) {
									set({ openAccordions: new Set(["panels"]) });
									const timeToFirstPanel = Date.now() - generationStartTime;
									trackPerformance("time_to_first_panel", timeToFirstPanel);
								}
							} catch (error) {
								const errorMessage =
									error instanceof Error
										? error.message
										: `Failed to generate panel ${i + 1}`;
								trackError(
									"panel_generation_failed",
									`Panel ${i + 1}: ${errorMessage}`,
								);
								set({ failedPanel: { step: "panel", panelNumber: i + 1 } });
								throw error;
							}
						}
					}

					set({ currentStepText: "Complete! 🎉", isGenerating: false });

					// Track successful generation
					const generationTime = Date.now() - generationStartTime;
					trackMangaGeneration(storyWordCount, state.generatedPanels.length);
					trackPerformance("total_generation_time", generationTime);
				} catch (error) {
					console.error("Generation error:", error);
					const errorMessage =
						error instanceof Error ? error.message : "Generation failed";

					_get().setErrorWithContext(
						errorMessage,
						currentStep ? `${currentStep} step failed` : "Generation",
					);
					set({
						isGenerating: false,
						failedStep: currentStep,
					});
				}
			},

			// Retry functions
			retryFromStep: async (step) => {
				if (!step) return;

				const state = _get();
				if (!state.originalStoryText) {
					_get().setErrorWithContext(
						"No original story found. Please start generation from the beginning.",
						"Retry Failed",
					);
					return;
				}

				trackEvent({
					action: "retry_from_step",
					category: "user_interaction",
					label: step,
				});

				// Use the main generation flow starting from the specified step
				await _get().generateComic(
					state.originalStoryText,
					state.originalStyle,
					state.originalNoDialogue,
					state.originalUploadedCharacterReferences || [],
					state.originalUploadedSettingReferences || [],
					step,
				);
			},

			retryFailedPanel: async (panelNumber, panelIndex) => {
				const state = _get();
				if (!state.originalStoryText) {
					_get().setErrorWithContext(
						"No original story found. Please start generation from the beginning.",
						"Panel Retry Failed",
					);
					return;
				}

				trackEvent({
					action: "retry_failed_panel",
					category: "user_interaction",
					label: `panel_${panelNumber}`,
				});

				// Use the main generation flow starting from the failed panel
				await _get().generateComic(
					state.originalStoryText,
					state.originalStyle,
					state.originalNoDialogue,
					state.originalUploadedCharacterReferences || [],
					state.originalUploadedSettingReferences || [],
					"panels",
					panelIndex,
				);
			},

			regenerateCharacter: async (characterName) => {
				const state = _get();

				// Validate we have all required data
				if (!state.storyAnalysis || !state.originalStyle) {
					_get().setErrorWithContext(
						"Missing required data for character regeneration. Please start generation from the beginning.",
						"Character Regeneration Failed",
					);
					return;
				}

				// Find the character data from the analysis
				const characterData = state.storyAnalysis.characters.find(
					(c) => c.name === characterName,
				);
				if (!characterData) {
					_get().setErrorWithContext(
						`Character ${characterName} not found in story analysis.`,
						"Character Regeneration Failed",
					);
					return;
				}

				trackEvent({
					action: "regenerate_character",
					category: "user_interaction",
					label: `character_${characterName}`,
				});

				try {
					// Generate the new character using our reusable helper
					const generatedCharacter = await generateSingleCharacterWithApi(
						characterData,
						state.storyAnalysis.setting,
						state.originalStyle,
						state.originalUploadedCharacterReferences || [],
					);

					// Update the character in the store
					await _get().updateCharacterReference(
						characterName,
						generatedCharacter,
					);

					trackEvent({
						action: "regenerate_character_success",
						category: "user_interaction",
						label: `character_${characterName}`,
					});
				} catch (error) {
					const errorMessage =
						error instanceof Error
							? error.message
							: `Failed to regenerate character ${characterName}`;

					_get().setErrorWithContext(
						errorMessage,
						"Character Regeneration Failed",
					);

					trackError(
						"character_regeneration_failed",
						`Character ${characterName}: ${errorMessage}`,
					);
				}
			},

			updateCharacterReference: async (characterName, newCharacter) => {
				set((state) => {
					const updatedCharacters = [...state.characterReferences];
					const existingIndex = updatedCharacters.findIndex(
						(c) => c.name === characterName,
					);
					if (existingIndex >= 0) {
						updatedCharacters[existingIndex] = newCharacter;
					} else {
						updatedCharacters.push(newCharacter);
					}
					return { characterReferences: updatedCharacters };
				});
				try {
					if (newCharacter.image) {
						await imageStorage.init();
						await imageStorage.storeImage(
							`char-${newCharacter.name}`,
							newCharacter.image,
						);
					}
				} catch (error) {
					console.warn(
						`Failed to persist character ${newCharacter.name} image:`,
						error,
					);
				}
			},

			regeneratePanel: async (panelNumber) => {
				const state = _get();

				// Validate we have all required data
				if (
					!state.storyBreakdown ||
					!state.storyAnalysis ||
					!state.characterReferences.length ||
					!state.originalStyle
				) {
					_get().setErrorWithContext(
						"Missing required data for panel regeneration. Please start generation from the beginning.",
						"Panel Regeneration Failed",
					);
					return;
				}

				// Find the panel data from the breakdown
				const panelData = state.storyBreakdown.panels.find(
					(p) => p.panelNumber === panelNumber,
				);
				if (!panelData) {
					_get().setErrorWithContext(
						`Panel ${panelNumber} not found in story breakdown.`,
						"Panel Regeneration Failed",
					);
					return;
				}

				trackEvent({
					action: "regenerate_panel",
					category: "user_interaction",
					label: `panel_${panelNumber}`,
				});

				try {
					// Generate the new panel using our reusable helper
					const generatedPanel = await generateSinglePanelWithApi(
						panelData!,
						state.characterReferences,
						state.storyAnalysis.setting,
						state.originalStyle,
						state.originalUploadedSettingReferences || [],
					);

					// Update the panel in the store
					await _get().updateGeneratedPanel(panelNumber, generatedPanel);

					trackEvent({
						action: "regenerate_panel_success",
						category: "user_interaction",
						label: `panel_${panelNumber}`,
					});
				} catch (error) {
					const errorMessage =
						error instanceof Error
							? error.message
							: `Failed to regenerate panel ${panelNumber}`;

					_get().setErrorWithContext(errorMessage, "Panel Regeneration Failed");

					trackError(
						"panel_regeneration_failed",
						`Panel ${panelNumber}: ${errorMessage}`,
					);
				}
			},
		}),
		{
			name: "generation-store",
			partialize: (state) => ({
				storyAnalysis: state.storyAnalysis,
				characterReferences: state.characterReferences.map(
					({ image, ...char }) => char,
				),
				storyBreakdown: state.storyBreakdown,
				generatedPanels: state.generatedPanels.map(
					({ image, ...panel }) => panel,
				),
			}),
			storage: createJSONStorage(() => ({
				getItem: (name: string) => {
					if (typeof window === "undefined") return null;
					try {
						return localStorage.getItem(name);
					} catch (error) {
						console.error("Failed to read from localStorage:", error);
						return null;
					}
				},
				setItem: (name: string, value: string) => {
					if (typeof window === "undefined") return;
					try {
						localStorage.setItem(name, value);
					} catch (error) {
						console.error("Failed to write to localStorage:", error);
						if (error instanceof Error && error.name === "QuotaExceededError") {
							console.warn(
								"localStorage quota exceeded. Data will not persist across sessions.",
							);
							// Optionally clear some old data here
							try {
								// Clear old data if exists
								localStorage.removeItem(name);
								// Try again with current data
								localStorage.setItem(name, value);
							} catch (retryError) {
								console.error(
									"Failed to save even after clearing old data:",
									retryError,
								);
							}
						}
					}
				},
				removeItem: (name: string) => {
					if (typeof window === "undefined") return;
					try {
						localStorage.removeItem(name);
					} catch (error) {
						console.error("Failed to remove from localStorage:", error);
					}
				},
			})),
			onRehydrateStorage: () => (state) => {
				// After rehydrating from localStorage, load images from IndexedDB
				if (state) {
					state.hydrateImages().catch(console.error);
				}
			},
		},
	),
);
