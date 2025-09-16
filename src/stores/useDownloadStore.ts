import html2canvas from "html2canvas";
import JSZip from "jszip";
import { create } from "zustand";
import { trackDownload, trackEvent } from "@/lib/analytics";
import type { CharacterReference, GeneratedPanel } from "@/types";

interface DownloadState {
	isDownloadingCharacters: boolean;
	isDownloadingPanels: boolean;
	isGeneratingComposite: boolean;
}

interface DownloadActions {
	setIsDownloadingCharacters: (isDownloading: boolean) => void;
	setIsDownloadingPanels: (isDownloading: boolean) => void;
	setIsGeneratingComposite: (isGenerating: boolean) => void;
	downloadCharacters: (
		characterReferences: CharacterReference[],
	) => Promise<void>;
	downloadPanels: (generatedPanels: GeneratedPanel[]) => Promise<void>;
	generateCompositeImage: (container?: HTMLElement | null) => Promise<void>;
	downloadImage: (imageUrl: string, filename: string) => void;
}

const initialState: DownloadState = {
	isDownloadingCharacters: false,
	isDownloadingPanels: false,
	isGeneratingComposite: false,
};

export const useDownloadStore = create<DownloadState & DownloadActions>()(
	(set) => ({
		...initialState,

		// Setters
		setIsDownloadingCharacters: (isDownloadingCharacters) =>
			set({ isDownloadingCharacters }),
		setIsDownloadingPanels: (isDownloadingPanels) =>
			set({ isDownloadingPanels }),
		setIsGeneratingComposite: (isGeneratingComposite) =>
			set({ isGeneratingComposite }),

		// Download single image
		downloadImage: (imageUrl, filename) => {
			const link = document.createElement("a");
			link.href = imageUrl;
			link.download = filename;
			link.click();
			trackDownload("png");
		},

		// Download character references as ZIP
		downloadCharacters: async (characterReferences) => {
			if (characterReferences.length === 0) return;

			set({ isDownloadingCharacters: true });

			try {
				const images = characterReferences.map((char) => ({
					url: char.image,
					filename: `${char.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_reference.png`,
				}));

				await downloadImagesAsZip(images, "character_references.zip");

				trackEvent({
					action: "download_character_references",
					category: "user_interaction",
					value: characterReferences.length,
				});
			} catch (error) {
				console.error("Failed to download character references:", error);
			} finally {
				set({ isDownloadingCharacters: false });
			}
		},

		// Download generated panels as ZIP
		downloadPanels: async (generatedPanels) => {
			if (generatedPanels.length === 0) return;

			set({ isDownloadingPanels: true });

			try {
				const images = generatedPanels.map((panel) => ({
					url: panel.image,
					filename: `panel_${String(panel.panelNumber).padStart(2, "0")}.png`,
				}));

				await downloadImagesAsZip(images, "manga_panels.zip");

				trackEvent({
					action: "download_manga_panels",
					category: "user_interaction",
					value: generatedPanels.length,
				});
			} catch (error) {
				console.error("Failed to download panels:", error);
			} finally {
				set({ isDownloadingPanels: false });
			}
		},

		// Generate composite image from panels container
		generateCompositeImage: async (container) => {
			set({ isGeneratingComposite: true });

			try {
				const panelsContainer =
					container || document.getElementById("panels-container");
				if (!panelsContainer) {
					throw new Error("Panels container not found");
				}

				trackEvent({
					action: "generate_composite_image",
					category: "user_interaction",
				});

				const canvas = await html2canvas(panelsContainer, {
					backgroundColor: "#ffffff",
					scale: 2,
					useCORS: true,
					allowTaint: true,
					height: panelsContainer.scrollHeight,
					windowHeight: panelsContainer.scrollHeight,
				});

				const dataURL = canvas.toDataURL("image/png");
				const link = document.createElement("a");
				link.href = dataURL;
				link.download = "manga_composite.png";
				link.click();

				trackDownload("png");
			} catch (error) {
				console.error("Failed to generate composite image:", error);
			} finally {
				set({ isGeneratingComposite: false });
			}
		},
	}),
);

// Helper function to download multiple images as ZIP
async function downloadImagesAsZip(
	images: { url: string; filename: string }[],
	zipFilename: string,
): Promise<void> {
	const zip = new JSZip();

	for (const { url, filename } of images) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				const blob = await response.blob();
				zip.file(filename, blob);
			}
		} catch (error) {
			console.warn(`Failed to fetch image: ${filename}`, error);
		}
	}

	const zipBlob = await zip.generateAsync({ type: "blob" });
	const zipUrl = URL.createObjectURL(zipBlob);

	const link = document.createElement("a");
	link.href = zipUrl;
	link.download = zipFilename;
	link.click();

	URL.revokeObjectURL(zipUrl);
	trackDownload("zip");
}
