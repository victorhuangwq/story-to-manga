import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
	trackError,
	trackEvent,
	trackMangaGeneration,
	trackPerformance,
} from "@/lib/analytics";
import type {
	CharacterReference,
	ComicStyle,
	GeneratedPanel,
	StoryAnalysis,
	StoryBreakdown,
	UploadedCharacterReference,
	UploadedSettingReference,
} from "@/types";
import { useUIStore } from "@/stores/useUIStore";

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
		uploadedCharacterReferences: UploadedCharacterReference[],
		uploadedSettingReferences: UploadedSettingReference[],
	) => Promise<void>;
	retryFromStep: (step: FailedStep) => Promise<void>;
	retryFailedPanel: (panelNumber: number, panelIndex: number) => Promise<void>;
	// Step-specific retry methods
	retryAnalysis: () => Promise<void>;
	retryCharacters: () => Promise<void>;
	retryLayout: () => Promise<void>;
	retryPanels: () => Promise<void>;
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

			// Step-specific retry methods
			retryAnalysis: async () => {
				const state = _get();
				if (!state.originalStoryText) {
					throw new Error("No original story text found for retry");
				}

				set({
					currentStepText: "Re-analyzing your story...",
					storyAnalysis: null,
					characterReferences: [],
					storyBreakdown: null,
					generatedPanels: [],
				});

				const analysisResponse = await fetch("/api/analyze-story", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						story: state.originalStoryText,
						style: state.originalStyle,
					}),
				});

				if (!analysisResponse.ok) {
					throw new Error(
						await handleApiError(
							analysisResponse,
							"Failed to re-analyze story",
						),
					);
				}

				const { analysis } = await analysisResponse.json();
				set({
					storyAnalysis: analysis,
					openAccordions: new Set(["analysis"]),
				});
			},

			retryCharacters: async () => {
				const state = _get();
				if (!state.storyAnalysis) {
					throw new Error(
						"No story analysis found. Please retry from analysis step.",
					);
				}

				set({
					currentStepText: "Re-creating character designs...",
					characterReferences: [],
					storyBreakdown: null,
					generatedPanels: [],
				});

				const charRefResponse = await fetch("/api/generate-character-refs", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						characters: state.storyAnalysis.characters,
						setting: state.storyAnalysis.setting,
						style: state.originalStyle,
						uploadedCharacterReferences:
							state.originalUploadedCharacterReferences,
					}),
				});

				if (!charRefResponse.ok) {
					throw new Error(
						await handleApiError(
							charRefResponse,
							"Failed to re-generate character references",
						),
					);
				}

				const { characterReferences } = await charRefResponse.json();
				await _get().setCharacterReferences(characterReferences);
				set({ openAccordions: new Set(["characters"]) });
			},

			retryLayout: async () => {
				const state = _get();
				if (!state.storyAnalysis || !state.characterReferences.length) {
					throw new Error(
						"Missing story analysis or character references. Please retry from an earlier step.",
					);
				}

				set({
					currentStepText: "Re-planning comic layout...",
					storyBreakdown: null,
					generatedPanels: [],
				});

				const storyBreakdownResponse = await fetch("/api/chunk-story", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						story: state.originalStoryText,
						characters: state.storyAnalysis.characters,
						setting: state.storyAnalysis.setting,
						style: state.originalStyle,
					}),
				});

				if (!storyBreakdownResponse.ok) {
					throw new Error(
						await handleApiError(
							storyBreakdownResponse,
							"Failed to re-break down story",
						),
					);
				}

				const { storyBreakdown: breakdown } =
					await storyBreakdownResponse.json();
				set({
					storyBreakdown: breakdown,
					openAccordions: new Set(["layout"]),
				});
			},

			retryPanels: async () => {
				const state = _get();
				if (
					!state.storyAnalysis ||
					!state.characterReferences.length ||
					!state.storyBreakdown
				) {
					throw new Error(
						"Missing required data for panel generation. Please retry from an earlier step.",
					);
				}

				set({
					currentStepText: "Re-generating comic panels...",
					generatedPanels: [],
				});

				const panels: GeneratedPanel[] = [];
				const generationStartTime = Date.now();

				for (let i = 0; i < state.storyBreakdown.panels.length; i++) {
					const panel = state.storyBreakdown.panels[i];
					set({
						currentStepText: `Re-generating panel ${i + 1}/${state.storyBreakdown.panels.length}...`,
					});

					const panelResponse = await fetch("/api/generate-panel", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							panel,
							characterReferences: state.characterReferences,
							setting: state.storyAnalysis.setting,
							style: state.originalStyle,
							uploadedSettingReferences:
								state.originalUploadedSettingReferences,
						}),
					});

					if (!panelResponse.ok) {
						const errorMessage = await handleApiError(
							panelResponse,
							`Failed to regenerate panel ${i + 1}`,
						);
						trackError(
							"panel_regeneration_failed",
							`Panel ${i + 1}: ${errorMessage}`,
						);
						set({ failedPanel: { step: "panel", panelNumber: i + 1 } });
						throw new Error(errorMessage);
					}

					const { generatedPanel } = await panelResponse.json();
					panels.push(generatedPanel);
					await _get().setGeneratedPanels([...panels]);

					// Auto-expand panels section after first panel
					if (i === 0) {
						set({ openAccordions: new Set(["panels"]) });
						const timeToFirstPanel = Date.now() - generationStartTime;
						trackPerformance("time_to_first_panel_retry", timeToFirstPanel);
					}
				}

				set({ openAccordions: new Set(["panels"]) });
			},
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
				uploadedCharacterReferences,
				uploadedSettingReferences,
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
					originalUploadedCharacterReferences: uploadedCharacterReferences,
					originalUploadedSettingReferences: uploadedSettingReferences,
				});

				// Clear previous results
				state.clearResults();

				// Track generation progress
				let currentStep: FailedStep = null;
				const generationStartTime = Date.now();

				trackEvent({
					action: "start_generation",
					category: "manga_generation",
					label: style,
					value: storyWordCount,
				});

				set({
					isGenerating: true,
					currentStepText: "Analyzing your story...",
					error: null,
					failedStep: null,
					failedPanel: null,
				});

				try {
					// Step 1: Analyze story
					currentStep = "analysis";
					const analysisResponse = await fetch("/api/analyze-story", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ story: storyText, style }),
					});

					if (!analysisResponse.ok) {
						throw new Error(
							await handleApiError(analysisResponse, "Failed to analyze story"),
						);
					}

					const { analysis } = await analysisResponse.json();
					set({
						storyAnalysis: analysis,
						openAccordions: new Set(["analysis"]),
					});

					// Step 2: Generate character references
					currentStep = "characters";
					set({ currentStepText: "Creating character designs..." });
					const charRefResponse = await fetch("/api/generate-character-refs", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							characters: analysis.characters,
							setting: analysis.setting,
							style,
							uploadedCharacterReferences,
						}),
					});

					if (!charRefResponse.ok) {
						throw new Error(
							await handleApiError(
								charRefResponse,
								"Failed to generate character references",
							),
						);
					}

					const { characterReferences } = await charRefResponse.json();
					await _get().setCharacterReferences(characterReferences);
					set({ openAccordions: new Set(["characters"]) });

					// Step 3: Break down story into panels
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

					const { storyBreakdown: breakdown } =
						await storyBreakdownResponse.json();
					set({
						storyBreakdown: breakdown,
						openAccordions: new Set(["layout"]),
					});

					// Step 4: Generate comic panels
					currentStep = "panels";
					const panels: GeneratedPanel[] = [];

					for (let i = 0; i < breakdown.panels.length; i++) {
						const panel = breakdown.panels[i];
						set({
							currentStepText: `Generating panel ${i + 1}/${breakdown.panels.length}...`,
						});

						const panelResponse = await fetch("/api/generate-panel", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								panel,
								characterReferences,
								setting: analysis.setting,
								style,
								uploadedSettingReferences,
							}),
						});

						if (!panelResponse.ok) {
							const errorMessage = await handleApiError(
								panelResponse,
								`Failed to generate panel ${i + 1}`,
							);
							trackError(
								"panel_generation_failed",
								`Panel ${i + 1}: ${errorMessage}`,
							);
							set({ failedPanel: { step: "panel", panelNumber: i + 1 } });
							throw new Error(errorMessage);
						}

						const { generatedPanel } = await panelResponse.json();
						panels.push(generatedPanel);
						await _get().setGeneratedPanels([...panels]);

						// Auto-expand panels section after first panel
						if (i === 0) {
							set({ openAccordions: new Set(["panels"]) });
							const timeToFirstPanel = Date.now() - generationStartTime;
							trackPerformance("time_to_first_panel", timeToFirstPanel);
						}
					}

					set({ currentStepText: "Complete! 🎉", isGenerating: false });

					// Track successful generation
					const generationTime = Date.now() - generationStartTime;
					trackMangaGeneration(storyWordCount, panels.length);
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
				if (!state.storyAnalysis) {
					_get().setErrorWithContext(
						"No story analysis found. Please start generation from the beginning.",
						"Retry Failed",
					);
					return;
				}

				trackEvent({
					action: "retry_from_step",
					category: "user_interaction",
					label: step,
				});

				set({
					isGenerating: true,
					error: null,
					errorCategory: null,
					errorSuggestion: null,
					failedStep: null,
					failedPanel: null,
				});

				try {
					switch (step) {
						case "analysis":
							await _get().retryAnalysis();
							break;
						case "characters":
							await _get().retryCharacters();
							break;
						case "layout":
							await _get().retryLayout();
							break;
						case "panels":
							await _get().retryPanels();
							break;
						default:
							throw new Error(`Unknown step: ${step}`);
					}
					set({ currentStepText: "Complete! 🎉", isGenerating: false });
				} catch (error) {
					console.error("Retry error:", error);
					const errorMessage =
						error instanceof Error ? error.message : "Retry failed";
					_get().setErrorWithContext(errorMessage, `${step} retry failed`);
					set({
						isGenerating: false,
						failedStep: step,
					});
				}
			},

			retryFailedPanel: async (panelNumber, panelIndex) => {
				const state = _get();
				if (
					!state.storyBreakdown ||
					!state.characterReferences.length ||
					!state.storyAnalysis
				) {
					_get().setErrorWithContext(
						"Missing required data for panel regeneration. Please start generation from the beginning.",
						"Panel Retry Failed",
					);
					return;
				}

				const panelData = state.storyBreakdown.panels[panelIndex];
				if (!panelData) {
					_get().setErrorWithContext(
						`Panel ${panelNumber} not found in story breakdown.`,
						"Panel Retry Failed",
					);
					return;
				}

				trackEvent({
					action: "retry_failed_panel",
					category: "user_interaction",
					label: `panel_${panelNumber}`,
				});

				set({
					isGenerating: true,
					error: null,
					errorCategory: null,
					errorSuggestion: null,
					failedPanel: null,
					currentStepText: `Retrying panel ${panelNumber}...`,
				});

				try {
					// Use existing data to regenerate the panel
					const panelResponse = await fetch("/api/generate-panel", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							panel: panelData,
							characterReferences: state.characterReferences,
							setting: state.storyAnalysis.setting,
							style: state.originalStyle, // Use original style
							uploadedSettingReferences:
								state.originalUploadedSettingReferences,
						}),
					});

					if (!panelResponse.ok) {
						const errorMessage = await handleApiError(
							panelResponse,
							`Failed to regenerate panel ${panelNumber}`,
							`Panel ${panelNumber} Retry`,
						);
						throw new Error(errorMessage);
					}

					const { generatedPanel } = await panelResponse.json();
					await _get().updateGeneratedPanel(panelNumber, generatedPanel);

					set({
						currentStepText: "Complete! 🎉",
						isGenerating: false,
						openAccordions: new Set(["panels"]), // Show panels section
					});
				} catch (error) {
					console.error("Panel retry error:", error);
					const errorMessage =
						error instanceof Error ? error.message : "Panel retry failed";
					_get().setErrorWithContext(
						errorMessage,
						`Panel ${panelNumber} retry failed`,
					);
					set({
						isGenerating: false,
						failedPanel: { step: "panel", panelNumber },
					});
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
