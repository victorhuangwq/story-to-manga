import { useEffect } from "react";
import { saveState } from "@/lib/storage";
import type {
	CharacterReference,
	ComicStyle,
	GeneratedPanel,
	StoryAnalysis,
	StoryBreakdown,
	UploadedCharacterReference,
	UploadedSettingReference,
} from "@/types";

interface UseAutoSaveProps {
	story: string;
	style: ComicStyle;
	noDialogue: boolean;
	storyAnalysis: StoryAnalysis | null;
	storyBreakdown: StoryBreakdown | null;
	characterReferences: CharacterReference[];
	generatedPanels: GeneratedPanel[];
	uploadedCharacterReferences: UploadedCharacterReference[];
	uploadedSettingReferences: UploadedSettingReference[];
	isLoadingState: boolean;
	setIsSavingState: (saving: boolean) => void;
}

export function useAutoSave(props: UseAutoSaveProps) {
	const {
		story,
		style,
		noDialogue,
		storyAnalysis,
		storyBreakdown,
		characterReferences,
		generatedPanels,
		uploadedCharacterReferences,
		uploadedSettingReferences,
		isLoadingState,
		setIsSavingState,
	} = props;

	useEffect(() => {
		if (isLoadingState) return; // Don't save while still loading

		const saveCurrentState = async () => {
			try {
				setIsSavingState(true);
				await saveState(
					story,
					style,
					noDialogue,
					storyAnalysis,
					storyBreakdown,
					characterReferences,
					generatedPanels,
					uploadedCharacterReferences,
					uploadedSettingReferences,
				);
			} catch (error) {
				console.error("Failed to save state:", error);
			} finally {
				setIsSavingState(false);
			}
		};

		// Only save if we have some meaningful content
		if (
			story.trim() ||
			storyAnalysis ||
			characterReferences.length > 0 ||
			generatedPanels.length > 0 ||
			uploadedCharacterReferences.length > 0 ||
			uploadedSettingReferences.length > 0
		) {
			saveCurrentState();
		}
	}, [
		story,
		style,
		noDialogue,
		storyAnalysis,
		storyBreakdown,
		characterReferences,
		generatedPanels,
		uploadedCharacterReferences,
		uploadedSettingReferences,
		isLoadingState,
		setIsSavingState,
	]);
}
