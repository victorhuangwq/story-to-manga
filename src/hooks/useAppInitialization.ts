import { useEffect } from "react";
import { loadState } from "@/lib/storage";
import type {
	CharacterReference,
	ComicStyle,
	GeneratedPanel,
	StoryAnalysis,
	StoryBreakdown,
	UploadedCharacterReference,
	UploadedSettingReference,
} from "@/types";

interface UseAppInitializationProps {
	setStory: (story: string) => void;
	setStyle: (style: ComicStyle) => void;
	setStoryAnalysis: (analysis: StoryAnalysis | null) => void;
	setCharacterReferences: (refs: CharacterReference[]) => Promise<void>;
	setStoryBreakdown: (breakdown: StoryBreakdown | null) => void;
	setGeneratedPanels: (panels: GeneratedPanel[]) => Promise<void>;
	setUploadedCharacterReferences: (refs: UploadedCharacterReference[]) => void;
	setUploadedSettingReferences: (refs: UploadedSettingReference[]) => void;
	setOpenAccordions: (accordions: Set<string>) => void;
	setIsLoadingState: (loading: boolean) => void;
}

export function useAppInitialization(props: UseAppInitializationProps) {
	const {
		setStory,
		setStyle,
		setStoryAnalysis,
		setCharacterReferences,
		setStoryBreakdown,
		setGeneratedPanels,
		setUploadedCharacterReferences,
		setUploadedSettingReferences,
		setOpenAccordions,
		setIsLoadingState,
	} = props;

	useEffect(() => {
		const initializeApp = async () => {
			try {
				const savedState = await loadState();
				if (savedState) {
					setStory(savedState.story);
					setStyle(savedState.style);
					setStoryAnalysis(savedState.storyAnalysis);
					await setCharacterReferences(savedState.characterReferences);
					setStoryBreakdown(savedState.storyBreakdown);
					await setGeneratedPanels(savedState.generatedPanels);
					setUploadedCharacterReferences(
						savedState.uploadedCharacterReferences,
					);
					setUploadedSettingReferences(savedState.uploadedSettingReferences);

					// Auto-expand sections with content
					const sectionsToExpand: string[] = [];
					if (savedState.storyAnalysis) sectionsToExpand.push("analysis");
					if (savedState.characterReferences.length > 0)
						sectionsToExpand.push("characters");
					if (savedState.storyBreakdown) sectionsToExpand.push("layout");
					if (savedState.generatedPanels.length > 0)
						sectionsToExpand.push("panels");
					if (
						savedState.generatedPanels.length > 0 &&
						savedState.characterReferences.length > 0
					) {
						sectionsToExpand.push("compositor");
					}
					setOpenAccordions(new Set(sectionsToExpand));
				}
			} catch (error) {
				console.error("Failed to load saved state:", error);
			} finally {
				setIsLoadingState(false);
			}
		};

		initializeApp();
	}, [
		setCharacterReferences,
		setGeneratedPanels,
		setIsLoadingState,
		setOpenAccordions,
		setStory,
		setStoryAnalysis,
		setStoryBreakdown,
		setStyle,
		setUploadedCharacterReferences,
		setUploadedSettingReferences,
	]);
}
