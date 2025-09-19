import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ComicStyle } from "@/types";

interface StoryState {
	story: string;
	style: ComicStyle;
	noDialogue: boolean;
	hasLoadedReddit: boolean;
	isLoadingReddit: boolean;
}

interface StoryActions {
	setStory: (story: string) => void;
	setStyle: (style: ComicStyle) => void;
	setNoDialogue: (noDialogue: boolean) => void;
	setHasLoadedReddit: (hasLoaded: boolean) => void;
	setIsLoadingReddit: (isLoading: boolean) => void;
	resetStory: () => void;
}

const initialState: StoryState = {
	story: "",
	style: "manga",
	noDialogue: false,
	hasLoadedReddit: false,
	isLoadingReddit: false,
};

export const useStoryStore = create<StoryState & StoryActions>()(
	persist(
		(set) => ({
			...initialState,
			setStory: (story) => set({ story }),
			setStyle: (style) => set({ style }),
			setNoDialogue: (noDialogue) => set({ noDialogue }),
			setHasLoadedReddit: (hasLoadedReddit) => set({ hasLoadedReddit }),
			setIsLoadingReddit: (isLoadingReddit) => set({ isLoadingReddit }),
			resetStory: () => set(initialState),
		}),
		{
			name: "story-store",
			partialize: (state) => ({
				story: state.story,
				style: state.style,
				noDialogue: state.noDialogue,
			}),
		},
	),
);
