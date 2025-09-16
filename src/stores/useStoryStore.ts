import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ComicStyle } from "@/types";

interface StoryState {
	story: string;
	style: ComicStyle;
	hasLoadedReddit: boolean;
	isLoadingReddit: boolean;
}

interface StoryActions {
	setStory: (story: string) => void;
	setStyle: (style: ComicStyle) => void;
	setHasLoadedReddit: (hasLoaded: boolean) => void;
	setIsLoadingReddit: (isLoading: boolean) => void;
	resetStory: () => void;
}

const initialState: StoryState = {
	story: "",
	style: "manga",
	hasLoadedReddit: false,
	isLoadingReddit: false,
};

export const useStoryStore = create<StoryState & StoryActions>()(
	persist(
		(set) => ({
			...initialState,
			setStory: (story) => set({ story }),
			setStyle: (style) => set({ style }),
			setHasLoadedReddit: (hasLoadedReddit) => set({ hasLoadedReddit }),
			setIsLoadingReddit: (isLoadingReddit) => set({ isLoadingReddit }),
			resetStory: () => set(initialState),
		}),
		{
			name: "story-store",
			partialize: (state) => ({
				story: state.story,
				style: state.style,
			}),
		},
	),
);
