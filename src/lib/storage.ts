import type {
	CharacterReference,
	ComicStyle,
	GeneratedPanel,
	StoryAnalysis,
	StoryBreakdown,
	UploadedCharacterReference,
	UploadedSettingReference,
} from "@/types";

// Storage keys
const STORAGE_KEYS = {
	STORY_STATE: "manga-story-state",
	IMAGE_DB: "manga-images",
	VERSION: "manga-storage-version",
} as const;

const STORAGE_VERSION = "1.0.0";

// TypeScript interface for persisted state
interface PersistedState {
	version: string;
	story: string;
	style: ComicStyle;
	storyAnalysis: StoryAnalysis | null;
	storyBreakdown: StoryBreakdown | null;
	characterReferences: Omit<CharacterReference, "image">[];
	generatedPanels: Omit<GeneratedPanel, "image">[];
	uploadedCharacterReferences: Omit<UploadedCharacterReference, "image">[];
	uploadedSettingReferences: Omit<UploadedSettingReference, "image">[];
	timestamp: number;
}

// IndexedDB setup for images
const DB_NAME = "MangaGeneratorDB";
const DB_VERSION = 1;
const IMAGE_STORE = "images";

class ImageStorage {
	private db: IDBDatabase | null = null;

	async init(): Promise<void> {
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

	async deleteImage(id: string): Promise<void> {
		if (!this.db) await this.init();

		return new Promise((resolve, reject) => {
			if (!this.db) {
				reject(new Error("Database not initialized"));
				return;
			}

			const transaction = this.db.transaction([IMAGE_STORE], "readwrite");
			const store = transaction.objectStore(IMAGE_STORE);
			const request = store.delete(id);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
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

// Main storage functions
export async function saveState(
	story: string,
	style: ComicStyle,
	storyAnalysis: StoryAnalysis | null,
	storyBreakdown: StoryBreakdown | null,
	characterReferences: CharacterReference[],
	generatedPanels: GeneratedPanel[],
	uploadedCharacterReferences: UploadedCharacterReference[] = [],
	uploadedSettingReferences: UploadedSettingReference[] = [],
): Promise<void> {
	try {
		// Save text data to localStorage
		const textState: PersistedState = {
			version: STORAGE_VERSION,
			story,
			style,
			storyAnalysis,
			storyBreakdown,
			characterReferences: characterReferences.map(
				({ image, ...char }) => char,
			),
			generatedPanels: generatedPanels.map(({ image, ...panel }) => panel),
			uploadedCharacterReferences: uploadedCharacterReferences.map(
				({ image, ...ref }) => ref,
			),
			uploadedSettingReferences: uploadedSettingReferences.map(
				({ image, ...ref }) => ref,
			),
			timestamp: Date.now(),
		};

		localStorage.setItem(STORAGE_KEYS.STORY_STATE, JSON.stringify(textState));

		// Save images to IndexedDB
		await imageStorage.init();

		// Store character images
		for (const char of characterReferences) {
			if (char.image) {
				await imageStorage.storeImage(`char-${char.name}`, char.image);
			}
		}

		// Store panel images
		for (const panel of generatedPanels) {
			if (panel.image) {
				await imageStorage.storeImage(
					`panel-${panel.panelNumber}`,
					panel.image,
				);
			}
		}

		// Store uploaded character reference images
		for (const charRef of uploadedCharacterReferences) {
			if (charRef.image) {
				await imageStorage.storeImage(
					`uploaded-char-${charRef.id}`,
					charRef.image,
				);
			}
		}

		// Store uploaded setting reference images
		for (const settingRef of uploadedSettingReferences) {
			if (settingRef.image) {
				await imageStorage.storeImage(
					`uploaded-setting-${settingRef.id}`,
					settingRef.image,
				);
			}
		}

		console.log("✅ State saved successfully");
	} catch (error) {
		console.error("❌ Failed to save state:", error);
		throw error;
	}
}

export async function loadState(): Promise<{
	story: string;
	style: ComicStyle;
	storyAnalysis: StoryAnalysis | null;
	storyBreakdown: StoryBreakdown | null;
	characterReferences: CharacterReference[];
	generatedPanels: GeneratedPanel[];
	uploadedCharacterReferences: UploadedCharacterReference[];
	uploadedSettingReferences: UploadedSettingReference[];
} | null> {
	try {
		// Load text data from localStorage
		const storedData = localStorage.getItem(STORAGE_KEYS.STORY_STATE);
		if (!storedData) return null;

		const textState: PersistedState = JSON.parse(storedData);

		// Version check
		if (textState.version !== STORAGE_VERSION) {
			console.warn("Storage version mismatch, clearing old data");
			await clearAllData();
			return null;
		}

		// Load images from IndexedDB
		await imageStorage.init();

		// Restore character images
		const characterReferences: CharacterReference[] = [];
		for (const char of textState.characterReferences) {
			try {
				const image = await imageStorage.getImage(`char-${char.name}`);
				if (image) {
					characterReferences.push({ ...char, image });
				}
			} catch (error) {
				console.warn(`Failed to load image for character ${char.name}:`, error);
			}
		}

		// Restore panel images
		const generatedPanels: GeneratedPanel[] = [];
		for (const panel of textState.generatedPanels) {
			try {
				const image = await imageStorage.getImage(`panel-${panel.panelNumber}`);
				if (image) {
					generatedPanels.push({ ...panel, image });
				}
			} catch (error) {
				console.warn(
					`Failed to load image for panel ${panel.panelNumber}:`,
					error,
				);
			}
		}

		// Restore uploaded character references
		const uploadedCharacterReferences: UploadedCharacterReference[] = [];
		for (const charRef of textState.uploadedCharacterReferences || []) {
			try {
				const image = await imageStorage.getImage(
					`uploaded-char-${charRef.id}`,
				);
				if (image) {
					uploadedCharacterReferences.push({ ...charRef, image });
				}
			} catch (error) {
				console.warn(
					`Failed to load uploaded character reference ${charRef.id}:`,
					error,
				);
			}
		}

		// Restore uploaded setting references
		const uploadedSettingReferences: UploadedSettingReference[] = [];
		for (const settingRef of textState.uploadedSettingReferences || []) {
			try {
				const image = await imageStorage.getImage(
					`uploaded-setting-${settingRef.id}`,
				);
				if (image) {
					uploadedSettingReferences.push({ ...settingRef, image });
				}
			} catch (error) {
				console.warn(
					`Failed to load uploaded setting reference ${settingRef.id}:`,
					error,
				);
			}
		}

		console.log(
			`✅ State loaded successfully (${characterReferences.length} characters, ${generatedPanels.length} panels, ${uploadedCharacterReferences.length} uploaded char refs, ${uploadedSettingReferences.length} uploaded setting refs)`,
		);

		return {
			story: textState.story,
			style: textState.style,
			storyAnalysis: textState.storyAnalysis,
			storyBreakdown: textState.storyBreakdown,
			characterReferences,
			generatedPanels,
			uploadedCharacterReferences,
			uploadedSettingReferences,
		};
	} catch (error) {
		console.error("❌ Failed to load state:", error);
		return null;
	}
}

export async function clearAllData(): Promise<void> {
	try {
		// Clear localStorage
		localStorage.removeItem(STORAGE_KEYS.STORY_STATE);

		// Clear IndexedDB
		await imageStorage.clear();

		console.log("✅ All data cleared successfully");
	} catch (error) {
		console.error("❌ Failed to clear data:", error);
		throw error;
	}
}

export function getStorageInfo(): { hasData: boolean; timestamp?: number } {
	try {
		const storedData = localStorage.getItem(STORAGE_KEYS.STORY_STATE);
		if (!storedData) return { hasData: false };

		const textState: PersistedState = JSON.parse(storedData);
		return {
			hasData: true,
			timestamp: textState.timestamp,
		};
	} catch {
		return { hasData: false };
	}
}
