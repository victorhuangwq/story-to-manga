import { useEffect } from "react";
import { trackError, trackEvent } from "@/lib/analytics";
import {
	fetchRedditPost,
	formatRedditStory,
	RedditApiError,
} from "@/lib/reddit-client";
import type {
	ComicStyle,
	UploadedCharacterReference,
	UploadedSettingReference,
} from "@/types";

interface UseRedditIntegrationProps {
	hasLoadedReddit: boolean;
	setHasLoadedReddit: (loaded: boolean) => void;
	setIsLoadingReddit: (loading: boolean) => void;
	setCurrentStepText: (text: string) => void;
	setStory: (story: string) => void;
	showError: (message: string) => void;
	style: ComicStyle;
	uploadedCharacterReferences: UploadedCharacterReference[];
	uploadedSettingReferences: UploadedSettingReference[];
	generateComic: (
		story: string,
		style: ComicStyle,
		charRefs: UploadedCharacterReference[],
		settingRefs: UploadedSettingReference[],
	) => Promise<void>;
}

export function useRedditIntegration(props: UseRedditIntegrationProps) {
	const {
		hasLoadedReddit,
		setHasLoadedReddit,
		setIsLoadingReddit,
		setCurrentStepText,
		setStory,
		showError,
		style,
		uploadedCharacterReferences,
		uploadedSettingReferences,
		generateComic,
	} = props;

	useEffect(() => {
		const handleRedditUrl = async () => {
			const urlParams = new URLSearchParams(window.location.search);
			const redditPath = urlParams.get("reddit");

			if (!redditPath || hasLoadedReddit) return;

			setHasLoadedReddit(true);
			setIsLoadingReddit(true);
			setCurrentStepText("Loading Reddit post...");

			try {
				const redditPost = await fetchRedditPost(redditPath);
				const formattedStory = formatRedditStory(redditPost);

				setStory(formattedStory);

				// Track Reddit usage
				trackEvent({
					action: "reddit_post_loaded",
					category: "user_interaction",
					label: redditPost.subreddit,
				});

				// Auto-start generation after a brief delay
				setTimeout(async () => {
					await generateComic(
						formattedStory,
						style,
						uploadedCharacterReferences,
						uploadedSettingReferences,
					);
				}, 1000);
			} catch (error) {
				console.error("Failed to load Reddit post:", error);

				let errorMessage = "Failed to load Reddit post";
				if (error instanceof RedditApiError) {
					errorMessage = error.message;
				}

				// Show error in a modal
				showError(errorMessage);

				trackError("reddit_loading", errorMessage);

				setIsLoadingReddit(false);
				setCurrentStepText("");

				return;
			}

			setIsLoadingReddit(false);
			setCurrentStepText("");
		};

		handleRedditUrl();
	}, [
		hasLoadedReddit,
		setHasLoadedReddit,
		setIsLoadingReddit,
		setCurrentStepText,
		setStory,
		showError,
		style,
		uploadedCharacterReferences,
		uploadedSettingReferences,
		generateComic,
	]);
}
