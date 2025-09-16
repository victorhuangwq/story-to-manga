import { create } from "zustand";

interface UIState {
	// Modal states
	modalImage: string | null;
	modalAlt: string;
	showConfirmClearModal: boolean;
	showErrorModal: boolean;
	errorModalMessage: string;

	// Loading states
	isDownloadingCharacters: boolean;
	isDownloadingPanels: boolean;
	isGeneratingComposite: boolean;
	isRerunningAnalysis: boolean;
	isRerunningCharacters: boolean;
	isRerunningLayout: boolean;
	isRerunningPanels: boolean;
	isLoadingState: boolean;
	isSavingState: boolean;

	// UI expansion states
	isCharacterRefsExpanded: boolean;
	isSettingRefsExpanded: boolean;

	// Accordion states
	openAccordions: Set<string>;
}

interface UIActions {
	// Modal actions
	openImageModal: (imageUrl: string, altText: string) => void;
	closeImageModal: () => void;
	setShowConfirmClearModal: (show: boolean) => void;
	showError: (message: string) => void;
	closeErrorModal: () => void;

	// Loading actions
	setIsDownloadingCharacters: (isLoading: boolean) => void;
	setIsDownloadingPanels: (isLoading: boolean) => void;
	setIsGeneratingComposite: (isLoading: boolean) => void;
	setIsRerunningAnalysis: (isLoading: boolean) => void;
	setIsRerunningCharacters: (isLoading: boolean) => void;
	setIsRerunningLayout: (isLoading: boolean) => void;
	setIsRerunningPanels: (isLoading: boolean) => void;
	setIsLoadingState: (isLoading: boolean) => void;
	setIsSavingState: (isSaving: boolean) => void;

	// UI expansion actions
	setIsCharacterRefsExpanded: (expanded: boolean) => void;
	setIsSettingRefsExpanded: (expanded: boolean) => void;

	// Accordion actions
	setOpenAccordions: (accordions: Set<string>) => void;
	toggleAccordion: (accordionId: string) => void;

	// Reset
	resetUI: () => void;
}

const initialState: UIState = {
	// Modal states
	modalImage: null,
	modalAlt: "",
	showConfirmClearModal: false,
	showErrorModal: false,
	errorModalMessage: "",

	// Loading states
	isDownloadingCharacters: false,
	isDownloadingPanels: false,
	isGeneratingComposite: false,
	isRerunningAnalysis: false,
	isRerunningCharacters: false,
	isRerunningLayout: false,
	isRerunningPanels: false,
	isLoadingState: true,
	isSavingState: false,

	// UI expansion states
	isCharacterRefsExpanded: false,
	isSettingRefsExpanded: false,

	// Accordion states
	openAccordions: new Set<string>(),
};

export const useUIStore = create<UIState & UIActions>()((set) => ({
	...initialState,

	// Modal actions
	openImageModal: (imageUrl, altText) =>
		set({
			modalImage: imageUrl,
			modalAlt: altText,
		}),
	closeImageModal: () =>
		set({
			modalImage: null,
			modalAlt: "",
		}),
	setShowConfirmClearModal: (showConfirmClearModal) =>
		set({ showConfirmClearModal }),
	showError: (message) =>
		set({
			showErrorModal: true,
			errorModalMessage: message,
		}),
	closeErrorModal: () =>
		set({
			showErrorModal: false,
			errorModalMessage: "",
		}),

	// Loading actions
	setIsDownloadingCharacters: (isDownloadingCharacters) =>
		set({ isDownloadingCharacters }),
	setIsDownloadingPanels: (isDownloadingPanels) => set({ isDownloadingPanels }),
	setIsGeneratingComposite: (isGeneratingComposite) =>
		set({ isGeneratingComposite }),
	setIsRerunningAnalysis: (isRerunningAnalysis) => set({ isRerunningAnalysis }),
	setIsRerunningCharacters: (isRerunningCharacters) =>
		set({ isRerunningCharacters }),
	setIsRerunningLayout: (isRerunningLayout) => set({ isRerunningLayout }),
	setIsRerunningPanels: (isRerunningPanels) => set({ isRerunningPanels }),
	setIsLoadingState: (isLoadingState) => set({ isLoadingState }),
	setIsSavingState: (isSavingState) => set({ isSavingState }),

	// UI expansion actions
	setIsCharacterRefsExpanded: (isCharacterRefsExpanded) =>
		set({ isCharacterRefsExpanded }),
	setIsSettingRefsExpanded: (isSettingRefsExpanded) =>
		set({ isSettingRefsExpanded }),

	// Accordion actions
	setOpenAccordions: (openAccordions) => set({ openAccordions }),
	toggleAccordion: (accordionId) =>
		set((state) => {
			const newOpenAccordions = new Set(state.openAccordions);
			if (newOpenAccordions.has(accordionId)) {
				newOpenAccordions.delete(accordionId);
			} else {
				newOpenAccordions.add(accordionId);
			}
			return { openAccordions: newOpenAccordions };
		}),

	// Reset
	resetUI: () => set(initialState),
}));
