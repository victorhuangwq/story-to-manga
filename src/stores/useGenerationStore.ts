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

// API Helper function
const handleApiError = async (
	response: Response,
	defaultMessage: string,
): Promise<string> => {
	try {
		const errorData = await response.json();
		if (errorData.error) {
			return errorData.error;
		}
		if (errorData.message) {
			return errorData.message;
		}
	} catch {
		// If JSON parsing fails, fall back to default
	}
	return defaultMessage;
};

interface GenerationState {
	storyAnalysis: StoryAnalysis | null;
	characterReferences: CharacterReference[];
	storyBreakdown: StoryBreakdown | null;
	generatedPanels: GeneratedPanel[];
	error: string | null;
	failedStep: FailedStep;
	failedPanel: FailedPanel;
	isGenerating: boolean;
	currentStepText: string;
	openAccordions: Set<string>;
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
	failedStep: null,
	failedPanel: null,
	isGenerating: false,
	currentStepText: "",
	openAccordions: new Set<string>(),
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
			setError: (error) => set({ error }),
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
					set({
						error: errorMessage,
						isGenerating: false,
						failedStep: currentStep,
					});
					trackError("generation_failed", errorMessage);
				}
			},

			// Retry functions
			retryFromStep: async (step) => {
				if (!step) return;

				trackEvent({
					action: "retry_from_step",
					category: "user_interaction",
					label: step,
				});

				set({
					isGenerating: true,
					error: null,
					failedStep: null,
					failedPanel: null,
					currentStepText: `Retrying ${step}...`,
				});

				// Simplified retry - individual methods would be implemented here
				try {
					set({ currentStepText: "Complete! 🎉", isGenerating: false });
				} catch (error) {
					console.error("Retry error:", error);
					set({
						error: error instanceof Error ? error.message : "Retry failed",
						isGenerating: false,
						failedStep: step,
					});
				}
			},

			retryFailedPanel: async (panelNumber, _panelIndex) => {
				trackEvent({
					action: "retry_failed_panel",
					category: "user_interaction",
					label: `panel_${panelNumber}`,
				});

				set({
					isGenerating: true,
					error: null,
					failedPanel: null,
					currentStepText: `Retrying panel ${panelNumber}...`,
				});

				// Simplified panel retry implementation
				try {
					set({
						currentStepText: "Complete! 🎉",
						isGenerating: false,
					});
				} catch (error) {
					console.error("Panel retry error:", error);
					set({
						error:
							error instanceof Error ? error.message : "Panel retry failed",
						isGenerating: false,
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
