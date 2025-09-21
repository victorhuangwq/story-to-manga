"use client";

import { useCallback, useId, useRef, useState } from "react";
import AccordionSection from "@/components/AccordionSection";
import CharacterCard from "@/components/CharacterCard";
import CollapsibleSection from "@/components/CollapsibleSection";
import DownloadButton from "@/components/DownloadButton";
import ImageUpload from "@/components/ImageUpload";
import PanelCard from "@/components/PanelCard";
import ReportIssueModal from "@/components/ReportIssueModal";
import RerunButton from "@/components/RerunButton";
import ShareableComicLayout from "@/components/ShareableComicLayout";
import { useAppInitialization } from "@/hooks/useAppInitialization";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useModalEscape } from "@/hooks/useEscapeKey";
import { useRedditIntegration } from "@/hooks/useRedditIntegration";
import { trackEvent } from "@/lib/analytics";
import { clearAllData, getStorageInfo } from "@/lib/storage";
import { useDownloadStore } from "@/stores/useDownloadStore";
import { useGenerationStore } from "@/stores/useGenerationStore";
import { useStoryStore } from "@/stores/useStoryStore";
import { useUIStore } from "@/stores/useUIStore";
import { useUploadStore } from "@/stores/useUploadStore";
import type { CharacterReference, GeneratedPanel } from "@/types";

// This should be a compelling story under 500 words that showcases the app's capabilities
const SAMPLE_STORY_TEXT = `One Hour Left

Victor eyed the timer: 01:00:00. “Plenty of time.”
Kingston sighed. “That sentence always ages badly. We need to move.”

They stared at the whiteboard. “Video, demo, write-up,” Kingston said.
“So… everything,” Victor said. “All of it,” Kingston said. “Fast.”

They opened the app. Victor pasted this story. “Going meta. Hitting Generate.”
“Good. If it works on us, it works on anything,” Kingston said.

Character refs appeared: Victor in a hoodie, Kingston with glasses.
“Hey, that’s actually us,” Victor said. “Lock these on every panel,” Kingston said. “No face drift.”

“Style pick?” Victor asked.
“Manga,” Kingston said. “Decide once, stay consistent.”

Layout spun up. Panel plan and bubbles drafted.
“Readable,” Victor said. “Let it run.”

Panels started streaming.
“Faces hold. Hair behaves,” Victor said. “Finally,” Kingston said.

One panel stalled.
“Panel six hiccup. Rerun it,” Kingston said. “On it,” Victor said. “Clean now.”

“Download All,” Victor said. “And the poster?”
“Create Shareable Image,” Kingston clicked. Tiles snapped into a neat grid.

The timer flipped to 00:01:00.
“Plenty of time,” Victor said.
"Submit before you jinx it," Kingston said.`;

export default function Home() {
	// Generate unique IDs for form elements
	const mangaRadioId = useId();
	const comicRadioId = useId();
	const storyTextareaId = useId();
	const analysisHeadingId = useId();

	// State for report issue modal
	const [isReportModalOpen, setIsReportModalOpen] = useState(false);
	// State for tracking which panels are being regenerated
	const [regeneratingPanels, setRegeneratingPanels] = useState<Set<number>>(
		new Set(),
	);
	// State for tracking which characters are being regenerated
	const [regeneratingCharacters, setRegeneratingCharacters] = useState<
		Set<string>
	>(new Set());
	const charactersHeadingId = useId();
	const layoutHeadingId = useId();
	const panelsHeadingId = useId();
	const compositorHeadingId = useId();

	// Ref for the compositor canvas
	const compositorRef = useRef<HTMLDivElement>(null);

	// Store hooks
	const {
		story,
		style,
		noDialogue,
		isLoadingReddit,
		hasLoadedReddit,
		setStory,
		setStyle,
		setNoDialogue,
		setIsLoadingReddit,
		setHasLoadedReddit,
	} = useStoryStore();

	const {
		storyAnalysis,
		characterReferences,
		storyBreakdown,
		generatedPanels,
		error,
		errorCategory,
		errorSuggestion,
		failedStep,
		failedPanel,
		isGenerating,
		currentStepText,
		openAccordions,
		generateComic,
		retryFromStep,
		retryFailedPanel,
		regeneratePanel,
		regenerateCharacter,
		setError,
		setCurrentStepText,
		setStoryAnalysis,
		setCharacterReferences,
		setStoryBreakdown,
		setGeneratedPanels,
		setFailedStep,
		setFailedPanel,
		clearResults,
		setOpenAccordions,
		toggleGenerationAccordion,
		collapseAllGenerationAccordions,
		expandAllGenerationAccordions,
	} = useGenerationStore();

	const {
		modalImage,
		modalAlt,
		showConfirmClearModal,
		showErrorModal,
		errorModalMessage,
		errorRetryCallback,
		isDownloadingCharacters,
		isDownloadingPanels,
		isGeneratingComposite,
		isRerunningAnalysis,
		isRerunningCharacters,
		isRerunningLayout,
		isRerunningPanels,
		isLoadingState,
		isSavingState,
		isCharacterRefsExpanded,
		isSettingRefsExpanded,
		openImageModal,
		closeImageModal,
		setShowConfirmClearModal,
		showError,
		closeErrorModal,
		setIsLoadingState,
		setIsSavingState,
		setIsCharacterRefsExpanded,
		setIsSettingRefsExpanded,
	} = useUIStore();

	const {
		uploadedCharacterReferences,
		uploadedSettingReferences,
		setUploadedCharacterReferences,
		setUploadedSettingReferences,
	} = useUploadStore();

	const {
		downloadImage,
		downloadCharacters,
		downloadPanels,
		generateCompositeImage,
	} = useDownloadStore();

	// Helper functions for accordion management
	const toggleAccordionSection = (section: string) => {
		const isOpen = openAccordions.has(section);
		toggleGenerationAccordion(section);
		trackEvent({
			action: isOpen ? "collapse_section" : "expand_section",
			category: "user_interaction",
			label: section,
		});
	};

	// Helper functions for panel status logic
	const getPanelStatus = () => {
		const expectedCount = storyBreakdown?.panels.length || 0;
		const currentCount = generatedPanels.length;

		if (currentCount === 0) return { isCompleted: false, isInProgress: false };
		if (currentCount === expectedCount && expectedCount > 0)
			return { isCompleted: true, isInProgress: false };
		return { isCompleted: false, isInProgress: true };
	};

	// Helper function for character status logic
	const getCharacterStatus = () => {
		const expectedCount = storyAnalysis?.characters.length || 0;
		const currentCount = characterReferences.length;

		if (currentCount === 0) return { isCompleted: false, isInProgress: false };
		if (currentCount === expectedCount && expectedCount > 0)
			return { isCompleted: true, isInProgress: false };
		return { isCompleted: false, isInProgress: true };
	};

	const wordCount = story
		.trim()
		.split(/\s+/)
		.filter((word) => word.length > 0).length;

	// Handler to populate story with sample text
	const loadSampleText = () => {
		setStory(SAMPLE_STORY_TEXT);
		trackEvent({
			action: "load_sample_story",
			category: "user_interaction",
		});
	};

	const downloadPanel = (panel: GeneratedPanel) => {
		downloadImage(panel.image, `comic-panel-${panel.panelNumber}.jpg`);
	};

	const downloadCharacter = (character: CharacterReference) => {
		downloadImage(
			character.image,
			`character-${character.name.toLowerCase().replace(/\s+/g, "-")}.jpg`,
		);
	};

	// Handler for regenerating individual panels
	const handleRegeneratePanel = useCallback(
		async (panelNumber: number) => {
			setRegeneratingPanels((prev) => new Set(prev).add(panelNumber));

			try {
				await regeneratePanel(panelNumber);
				trackEvent({
					action: "panel_regenerated",
					category: "user_interaction",
					label: `panel_${panelNumber}`,
				});
			} catch (error) {
				console.error(`Failed to regenerate panel ${panelNumber}:`, error);
			} finally {
				setRegeneratingPanels((prev) => {
					const newSet = new Set(prev);
					newSet.delete(panelNumber);
					return newSet;
				});
			}
		},
		[regeneratePanel],
	);

	// Handler for regenerating individual characters
	const handleRegenerateCharacter = useCallback(
		async (characterName: string) => {
			setRegeneratingCharacters((prev) => new Set(prev).add(characterName));

			try {
				await regenerateCharacter(characterName);
				trackEvent({
					action: "character_regenerated",
					category: "user_interaction",
					label: `character_${characterName}`,
				});
			} catch (error) {
				console.error(
					`Failed to regenerate character ${characterName}:`,
					error,
				);
			} finally {
				setRegeneratingCharacters((prev) => {
					const newSet = new Set(prev);
					newSet.delete(characterName);
					return newSet;
				});
			}
		},
		[regenerateCharacter],
	);

	// Enhanced modal handler with tracking
	const handleOpenImageModal = useCallback(
		(imageUrl: string, altText: string) => {
			handleOpenImageModal(imageUrl, altText);
			trackEvent({
				action: "open_image_modal",
				category: "user_interaction",
				label: altText,
			});
		},
		[],
	);

	// Cancel clearing data
	const cancelClearData = useCallback(() => {
		setShowConfirmClearModal(false);
	}, [setShowConfirmClearModal]);

	// Simplified handlers using store actions
	const handleShowError = (message: string) => showError(message);

	// Custom hooks for complex effects
	useModalEscape({
		modalImage,
		showConfirmClearModal,
		showErrorModal,
		closeImageModal,
		cancelClearData,
		closeErrorModal,
	});

	useAppInitialization({
		setStory,
		setStyle,
		setNoDialogue,
		setStoryAnalysis,
		setCharacterReferences,
		setStoryBreakdown,
		setGeneratedPanels,
		setUploadedCharacterReferences,
		setUploadedSettingReferences,
		setOpenAccordions,
		setIsLoadingState,
	});

	useRedditIntegration({
		hasLoadedReddit,
		setHasLoadedReddit,
		setIsLoadingReddit,
		setCurrentStepText,
		setStory,
		showError,
		style,
		noDialogue,
		uploadedCharacterReferences,
		uploadedSettingReferences,
		generateComic,
	});

	useAutoSave({
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
	});

	// Generic JSON download utility
	const downloadAsJson = (
		data: Record<string, unknown>,
		filename: string,
		exportTitle: string,
	) => {
		const exportData = {
			metadata: {
				title: exportTitle,
				exportDate: new Date().toISOString(),
				style: style,
				generatedBy: "Story to Manga Machine",
			},
			...data,
		};

		const blob = new Blob([JSON.stringify(exportData, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `${filename}-${Date.now()}.json`;
		link.click();
		URL.revokeObjectURL(url);
	};

	const downloadStoryAnalysis = () => {
		if (!storyAnalysis) return;
		downloadAsJson(
			{
				storyAnalysis: {
					title: storyAnalysis.title,
					characters: storyAnalysis.characters,
					setting: storyAnalysis.setting,
				},
			},
			"story-analysis",
			"Story Analysis Export",
		);
	};

	const downloadComicLayout = () => {
		if (!storyBreakdown || !storyAnalysis) return;
		downloadAsJson(
			{
				storyTitle: storyAnalysis.title,
				panelCount: storyBreakdown.panels.length,
				panels: storyBreakdown.panels.map((panel) => ({
					panelNumber: panel.panelNumber,
					sceneDescription: panel.sceneDescription,
					dialogue: panel.dialogue,
					characters: panel.characters,
					cameraAngle: panel.cameraAngle,
					visualMood: panel.visualMood,
				})),
			},
			"comic-layout",
			"Comic Layout Export",
		);
	};

	// Load state on component mount

	// Show confirmation modal for clearing data
	const handleClearAllData = () => {
		setShowConfirmClearModal(true);
	};

	// Actually clear all data after confirmation
	const confirmClearAllData = async () => {
		setShowConfirmClearModal(false);

		try {
			await clearAllData();
			setStory("");
			setStyle("manga");
			setStoryAnalysis(null);
			await setCharacterReferences([]);
			setStoryBreakdown(null);
			await setGeneratedPanels([]);
			setError(null);
			setFailedStep(null);
			setFailedPanel(null);
			setUploadedCharacterReferences([]);
			setUploadedSettingReferences([]);
			setOpenAccordions(new Set());
		} catch (error) {
			console.error("Failed to clear data:", error);
			handleShowError("Failed to clear saved data");
		}
	};

	const hasCompositeContent =
		generatedPanels.length > 0 && characterReferences.length > 0;
	const hasAnyContent =
		story.trim() ||
		storyAnalysis ||
		characterReferences.length > 0 ||
		generatedPanels.length > 0 ||
		uploadedCharacterReferences.length > 0 ||
		uploadedSettingReferences.length > 0;
	const storageInfo = getStorageInfo();

	// Show loading screen while initializing
	if (isLoadingState) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-manga-off-white">
				<div className="text-center">
					<div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-manga-black mb-4"></div>
					<p className="text-manga-medium-gray">
						Loading your saved content...
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className={`min-h-screen py-4 px-4 style-${style}`}>
			{/* Top navigation with logo */}
			<div className="mb-4 flex items-center gap-3">
				<a
					href="/"
					className="inline-flex items-center hover:opacity-80 transition-opacity"
					title="Story to Manga Machine - Home"
				>
					<img
						src="/logo.png"
						alt="Story to Manga Machine Logo"
						className="w-8 h-8 rounded"
					/>
				</a>
				<a
					href="https://github.com/victorhuangwq/story-to-manga"
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center hover:opacity-80 transition-opacity"
					title="View on GitHub"
				>
					<svg
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="currentColor"
						className="text-manga-black"
					>
						<title>GitHub Repository</title>
						<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.30.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
					</svg>
				</a>
			</div>
			<div className="flex flex-col lg:flex-row gap-4 h-full">
				{/* Left Panel - Input */}
				<div className="w-full lg:w-1/3 mb-4 lg:mb-0">
					<div className="comic-panel h-full">
						<h1 className="text-2xl text-center mb-2">
							Story to {style === "manga" ? "Manga" : "Comic"} Generator
						</h1>
						<div className="text-center mb-4">
							<img
								src="/description-panel.jpeg"
								alt="Manga artist working at computer creating comic panels"
								className="w-full max-w-md mx-auto rounded-lg shadow-comic border-2 border-manga-black mb-3"
							/>
						</div>
						<p className="text-center text-manga-medium-gray mb-4">
							Transform stories into manga and comics with AI. Write your story
							and watch it come to life!
						</p>

						{/* Style Selection */}
						<div className="mb-4">
							<div className="text-manga-black font-medium mb-2">
								Comic Style
							</div>
							<fieldset className="flex w-full">
								<input
									type="radio"
									className="sr-only"
									name="style"
									id={mangaRadioId}
									checked={style === "manga"}
									onChange={() => {
										setStyle("manga");
										trackEvent({
											action: "change_style",
											category: "user_interaction",
											label: "manga",
										});
									}}
								/>
								<label
									className="btn-manga-outline flex-1 text-center cursor-pointer rounded-l-lg"
									htmlFor={mangaRadioId}
								>
									Japanese Manga
								</label>

								<input
									type="radio"
									className="sr-only"
									name="style"
									id={comicRadioId}
									checked={style === "comic"}
									onChange={() => {
										setStyle("comic");
										trackEvent({
											action: "change_style",
											category: "user_interaction",
											label: "comic",
										});
									}}
								/>
								<label
									className="btn-manga-outline flex-1 text-center cursor-pointer rounded-r-lg"
									htmlFor={comicRadioId}
								>
									American Comic
								</label>
							</fieldset>
						</div>

						{/* No Dialogue Option */}
						<div className="mb-4">
							<label className="flex items-center space-x-2">
								<input
									type="checkbox"
									className="form-checkbox h-4 w-4 text-manga-black"
									checked={noDialogue}
									onChange={(e) => {
										setNoDialogue(e.target.checked);
										trackEvent({
											action: "toggle_no_dialogue",
											category: "user_interaction",
											label: e.target.checked ? "enabled" : "disabled",
										});
									}}
								/>
								<span className="text-manga-black font-medium">
									No Dialogue Mode
								</span>
							</label>
							<p className="text-sm text-manga-medium-gray mt-1">
								Generate panels without speech bubbles for pure visual
								storytelling
							</p>
						</div>

						{/* Story Input */}
						<div className="mb-4">
							<label
								className="block text-manga-black font-medium mb-2"
								htmlFor={storyTextareaId}
							>
								Your Story{" "}
								<span className="inline-block bg-manga-medium-gray text-white px-2 py-1 rounded text-xs ml-2">
									{wordCount}/500 words
								</span>
							</label>
							<textarea
								id={storyTextareaId}
								className="form-control-manga"
								rows={8}
								value={story}
								onChange={(e) => {
									setStory(e.target.value);
									// Track when user starts typing (once per session)
									if (e.target.value.length === 1 && story.length === 0) {
										trackEvent({
											action: "start_typing_story",
											category: "user_interaction",
										});
									}
								}}
								placeholder="Enter your story here... (max 500 words)"
								disabled={isGenerating || isLoadingReddit}
							/>
							{/* Try Sample Button - only show when story is empty or has very few words */}
							{wordCount < 10 && (
								<div className="mt-2">
									<button
										type="button"
										className="btn-manga-secondary text-sm"
										onClick={loadSampleText}
										disabled={isGenerating || isLoadingReddit}
									>
										📖 Try Sample Story
									</button>
								</div>
							)}
							{wordCount > 500 && (
								<div className="text-manga-danger text-sm mt-1">
									Story is too long. Please reduce to 500 words or less.
								</div>
							)}
						</div>

						{/* Reference Images Upload - Optional */}
						<div className="mb-4 space-y-4">
							{/* Character Reference Images */}
							<CollapsibleSection
								title="📸 Character Reference Images (Optional)"
								isExpanded={isCharacterRefsExpanded}
								onToggle={() =>
									setIsCharacterRefsExpanded(!isCharacterRefsExpanded)
								}
								badge={
									uploadedCharacterReferences.length > 0
										? `${uploadedCharacterReferences.length} image${uploadedCharacterReferences.length !== 1 ? "s" : ""}`
										: undefined
								}
							>
								<ImageUpload
									title="Character Reference Images"
									description="Upload reference images of characters to guide their visual design. These will be used when generating character designs."
									type="character"
									maxImages={5}
									maxSizeMB={10}
								/>
							</CollapsibleSection>

							{/* Setting Reference Images */}
							<CollapsibleSection
								title="🏞️ Setting Reference Images (Optional)"
								isExpanded={isSettingRefsExpanded}
								onToggle={() =>
									setIsSettingRefsExpanded(!isSettingRefsExpanded)
								}
								badge={
									uploadedSettingReferences.length > 0
										? `${uploadedSettingReferences.length} image${uploadedSettingReferences.length !== 1 ? "s" : ""}`
										: undefined
								}
							>
								<ImageUpload
									title="Setting Reference Images"
									description="Upload reference images of locations, environments, or scenes to guide the visual style of your comic panels."
									type="setting"
									maxImages={5}
									maxSizeMB={10}
								/>
							</CollapsibleSection>
						</div>

						{/* Error Display */}
						{error && (
							<div
								className="bg-manga-danger/10 border border-manga-danger text-manga-danger p-3 rounded mb-4"
								role="alert"
							>
								<strong>Error:</strong> {error}
								{errorSuggestion && (
									<div className="mt-2 text-sm opacity-80">
										<strong>Suggestion:</strong> {errorSuggestion}
									</div>
								)}
								{errorCategory && (
									<div className="mt-1 text-xs opacity-60">
										Category: {errorCategory.replace("_", " ")}
									</div>
								)}
								{(failedStep || failedPanel) && (
									<div className="mt-2">
										{failedPanel ? (
											<button
												type="button"
												className="px-3 py-1 text-sm border border-manga-danger text-manga-danger rounded hover:bg-manga-danger hover:text-white transition-colors"
												onClick={() =>
													retryFailedPanel(
														failedPanel.panelNumber,
														failedPanel.panelNumber - 1,
													)
												}
												disabled={isGenerating || isLoadingReddit}
											>
												Retry Panel {failedPanel.panelNumber}
											</button>
										) : failedStep ? (
											<button
												type="button"
												className="px-3 py-1 text-sm border border-manga-danger text-manga-danger rounded hover:bg-manga-danger hover:text-white transition-colors"
												onClick={() => retryFromStep(failedStep)}
												disabled={isGenerating || isLoadingReddit}
											>
												Retry from{" "}
												{failedStep.charAt(0).toUpperCase() +
													failedStep.slice(1)}{" "}
												Step
											</button>
										) : null}
									</div>
								)}
							</div>
						)}

						{/* Generate Button */}
						<button
							type="button"
							className="btn-manga-primary w-full mb-2"
							onClick={() =>
								generateComic(
									story,
									style,
									noDialogue,
									uploadedCharacterReferences,
									uploadedSettingReferences,
								)
							}
							disabled={
								isGenerating ||
								isLoadingReddit ||
								!story.trim() ||
								wordCount > 500
							}
						>
							{isGenerating || isLoadingReddit ? (
								<>
									<span
										className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"
										aria-hidden="true"
									></span>
									{currentStepText || "Loading..."}
								</>
							) : (
								"Generate"
							)}
						</button>

						{/* Clear Results Button */}
						{(storyAnalysis ||
							characterReferences.length > 0 ||
							storyBreakdown ||
							generatedPanels.length > 0) && (
							<button
								type="button"
								className="btn-manga-outline w-full mb-2"
								onClick={clearResults}
								disabled={isGenerating || isLoadingReddit}
							>
								Clear Previous Results
							</button>
						)}

						{/* Clear All Data Button */}
						{hasAnyContent && (
							<button
								type="button"
								className="btn-manga-outline w-full text-xs"
								onClick={handleClearAllData}
								disabled={isGenerating || isLoadingReddit}
								style={{ fontSize: "12px", padding: "8px 12px" }}
							>
								🗑️ Clear All Saved Data
							</button>
						)}

						{/* Storage Info */}
						{storageInfo.hasData && (
							<div className="text-xs text-manga-medium-gray mt-2 text-center">
								💾 Data saved
								{storageInfo.timestamp
									? ` ${new Date(storageInfo.timestamp).toLocaleTimeString()}`
									: ""}
								{isSavingState && <span className="ml-1">💾 Saving...</span>}
							</div>
						)}
					</div>
				</div>

				{/* Right Panel - Generation Results */}
				<div className="w-full lg:w-2/3">
					<div className="comic-panel h-full">
						<div className="flex justify-between items-center mb-4">
							<h2 className="text-xl">Behind the Scenes</h2>
							<button
								type="button"
								className="btn-manga-outline text-sm"
								onClick={() => {
									const hasAnyOpen = openAccordions.size > 0;
									if (hasAnyOpen) {
										collapseAllGenerationAccordions();
									} else {
										expandAllGenerationAccordions();
									}
								}}
								title={
									openAccordions.size > 0
										? "Collapse all sections"
										: "Expand all sections"
								}
							>
								{openAccordions.size > 0 ? "Collapse All" : "Expand All"}
							</button>
						</div>

						<div className="accordion-manga space-y-4">
							{/* Step 1: Story Analysis */}
							<AccordionSection
								id={analysisHeadingId}
								title="Story Analysis"
								stepNumber={1}
								isCompleted={!!storyAnalysis}
								isInProgress={
									isGenerating &&
									!storyAnalysis &&
									currentStepText.includes("Analyzing")
								}
								isOpen={openAccordions.has("analysis")}
								onToggle={() => toggleAccordionSection("analysis")}
								showStatus={isGenerating || !!storyAnalysis}
							>
								{storyAnalysis ? (
									<div>
										<div className="flex justify-between items-center mb-3">
											<h5 className="font-semibold">Story Analysis</h5>
											<DownloadButton
												onClick={downloadStoryAnalysis}
												isLoading={false}
												label="Download"
												loadingText=""
												variant="outline"
											/>
										</div>
										<h5 className="font-semibold mb-2">Title:</h5>
										<p className="mb-3">{storyAnalysis.title}</p>
										<h5 className="font-semibold mb-2">Characters:</h5>
										<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
											{storyAnalysis.characters.map((char) => (
												<CharacterCard
													key={char.name}
													character={char}
													showImage={false}
												/>
											))}
										</div>
										<h5 className="font-semibold mt-3 mb-2">Setting:</h5>
										<p>
											<strong>Location:</strong>{" "}
											{storyAnalysis.setting.location}
										</p>
										<p>
											<strong>Time Period:</strong>{" "}
											{storyAnalysis.setting.timePeriod}
										</p>
										<p>
											<strong>Mood:</strong> {storyAnalysis.setting.mood}
										</p>
										<div className="mt-3">
											<RerunButton
												onClick={() => retryFromStep("analysis")}
												isLoading={isRerunningAnalysis}
												disabled={isGenerating || isLoadingReddit}
											/>
										</div>
									</div>
								) : (
									<div>
										<p className="text-manga-medium-gray">
											Story analysis will appear here once generation begins.
										</p>
										{failedStep === "analysis" && (
											<button
												type="button"
												className="px-3 py-1 text-sm border border-manga-info text-manga-info rounded hover:bg-manga-info hover:text-white transition-colors mt-2"
												onClick={() => retryFromStep("analysis")}
												disabled={isGenerating || isLoadingReddit}
											>
												Retry Story Analysis
											</button>
										)}
									</div>
								)}
							</AccordionSection>

							{/* Step 2: Character Designs */}
							<AccordionSection
								id={charactersHeadingId}
								title="Character Designs"
								stepNumber={2}
								isCompleted={getCharacterStatus().isCompleted}
								isInProgress={
									getCharacterStatus().isInProgress ||
									(isGenerating &&
										!!storyAnalysis &&
										currentStepText.includes("character"))
								}
								isOpen={openAccordions.has("characters")}
								onToggle={() => toggleAccordionSection("characters")}
								showStatus={isGenerating || characterReferences.length > 0}
							>
								{storyAnalysis ? (
									<div>
										<div className="flex justify-between items-center mb-3">
											<h5 className="font-semibold">Character Designs</h5>
											{characterReferences.length > 0 && (
												<DownloadButton
													onClick={() =>
														downloadCharacters(characterReferences)
													}
													isLoading={isDownloadingCharacters}
													label="Download All Characters"
													loadingText="Creating zip..."
													variant="outline"
												/>
											)}
										</div>
										<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
											{storyAnalysis.characters.map((expectedChar) => {
												const generatedChar = characterReferences.find(
													(c) => c.name === expectedChar.name,
												);
												const isCurrentlyGenerating =
													isGenerating &&
													currentStepText.includes("character") &&
													currentStepText.includes(expectedChar.name);

												if (generatedChar) {
													// Show completed character with image
													return (
														<CharacterCard
															key={expectedChar.name}
															character={generatedChar}
															showImage={true}
															onImageClick={openImageModal}
															onDownload={() =>
																downloadCharacter(generatedChar)
															}
															onRegenerate={() =>
																handleRegenerateCharacter(generatedChar.name)
															}
															isRegenerating={regeneratingCharacters.has(
																generatedChar.name,
															)}
														/>
													);
												} else {
													// Show placeholder for pending/generating character
													return (
														<div
															key={`placeholder-${expectedChar.name}`}
															className={`card-manga ${isCurrentlyGenerating ? "animate-pulse" : ""} border-dashed border-2 border-manga-medium-gray/50 bg-manga-medium-gray/10`}
														>
															<div className="card-body text-center py-8">
																{isCurrentlyGenerating ? (
																	<>
																		<div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-manga-black mb-2"></div>
																		<h6 className="card-title">
																			Generating {expectedChar.name}...
																		</h6>
																	</>
																) : (
																	<h6 className="card-title text-manga-medium-gray">
																		{expectedChar.name}
																	</h6>
																)}
																<p className="card-text text-sm text-manga-medium-gray/80 mt-2">
																	{expectedChar.physicalDescription}
																</p>
																<p className="card-text text-xs text-manga-medium-gray/60">
																	<em>{expectedChar.role}</em>
																</p>
															</div>
														</div>
													);
												}
											})}
										</div>
										<div className="mt-3">
											<RerunButton
												onClick={() => retryFromStep("characters")}
												isLoading={isRerunningCharacters}
												disabled={isGenerating || !storyAnalysis}
											/>
										</div>
									</div>
								) : (
									<div>
										<p className="text-manga-medium-gray">
											Character design images will appear here after story
											analysis.
										</p>
										{failedStep === "characters" && storyAnalysis && (
											<button
												type="button"
												className="px-3 py-1 text-sm border border-manga-info text-manga-info rounded hover:bg-manga-info hover:text-white transition-colors mt-2"
												onClick={() => retryFromStep("characters")}
												disabled={isGenerating || isLoadingReddit}
											>
												Retry Character Generation
											</button>
										)}
									</div>
								)}
							</AccordionSection>

							{/* Step 3: Comic Layout Plan */}
							<AccordionSection
								id={layoutHeadingId}
								title="Comic Layout Plan"
								stepNumber={3}
								isCompleted={!!storyBreakdown}
								isInProgress={
									isGenerating &&
									characterReferences.length > 0 &&
									!storyBreakdown &&
									currentStepText.includes("layout")
								}
								isOpen={openAccordions.has("layout")}
								onToggle={() => toggleAccordionSection("layout")}
								showStatus={isGenerating || !!storyBreakdown}
							>
								{storyBreakdown ? (
									<div>
										<div className="flex justify-between items-center mb-3">
											<h5 className="font-semibold">
												Panel Sequence ({storyBreakdown.panels.length} panels)
											</h5>
											<DownloadButton
												onClick={downloadComicLayout}
												isLoading={false}
												label="Download"
												loadingText=""
												variant="outline"
											/>
										</div>
										<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
											{storyBreakdown.panels.map((panel) => (
												<PanelCard
													key={`panel-${panel.panelNumber}`}
													panel={panel}
													showImage={false}
												/>
											))}
										</div>
										<div className="mt-3">
											<RerunButton
												onClick={() => retryFromStep("layout")}
												isLoading={isRerunningLayout}
												disabled={isGenerating || !storyAnalysis}
											/>
										</div>
									</div>
								) : (
									<div>
										<p className="text-manga-medium-gray">
											Comic layout plan will appear here after character designs
											are complete.
										</p>
										{failedStep === "layout" &&
											storyAnalysis &&
											characterReferences.length > 0 && (
												<button
													type="button"
													className="px-3 py-1 text-sm border border-manga-info text-manga-info rounded hover:bg-manga-info hover:text-white transition-colors mt-2"
													onClick={() => retryFromStep("layout")}
													disabled={isGenerating || isLoadingReddit}
												>
													Retry Comic Layout
												</button>
											)}
									</div>
								)}
							</AccordionSection>

							{/* Step 4: Generated Panels */}
							<AccordionSection
								id={panelsHeadingId}
								title="Generated Panels"
								stepNumber={4}
								isCompleted={getPanelStatus().isCompleted}
								isInProgress={
									getPanelStatus().isInProgress ||
									(isGenerating &&
										!!storyBreakdown &&
										currentStepText.includes("panel"))
								}
								isOpen={openAccordions.has("panels")}
								onToggle={() => toggleAccordionSection("panels")}
								showStatus={isGenerating || generatedPanels.length > 0}
							>
								{storyBreakdown ? (
									<div>
										<div className="flex justify-between items-center mb-3">
											<h5 className="font-semibold">Your Comic Panels</h5>
											{generatedPanels.length > 0 && (
												<DownloadButton
													onClick={() => downloadPanels(generatedPanels)}
													isLoading={isDownloadingPanels}
													label="Download All Panels"
													loadingText="Creating zip..."
													variant="outline"
												/>
											)}
										</div>
										<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
											{storyBreakdown.panels.map((panel, index) => {
												const generatedPanel = generatedPanels.find(
													(p) => p.panelNumber === panel.panelNumber,
												);
												const isCurrentlyGenerating =
													isGenerating &&
													currentStepText.includes("panel") &&
													generatedPanels.length === index;

												if (generatedPanel) {
													// Show completed panel
													return (
														<PanelCard
															key={`generated-panel-${panel.panelNumber}`}
															panel={generatedPanel}
															showImage={true}
															onImageClick={openImageModal}
															onDownload={() => downloadPanel(generatedPanel)}
															onRegenerate={() =>
																handleRegeneratePanel(panel.panelNumber)
															}
															isRegenerating={regeneratingPanels.has(
																panel.panelNumber,
															)}
														/>
													);
												} else {
													// Show placeholder for pending/generating panel
													return (
														<div
															key={`placeholder-panel-${panel.panelNumber}`}
															className={`card-manga ${isCurrentlyGenerating ? "animate-pulse" : ""} border-dashed border-2 border-manga-medium-gray/50 bg-manga-medium-gray/10`}
														>
															<div className="card-body text-center py-8">
																{isCurrentlyGenerating ? (
																	<>
																		<div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-manga-black mb-2"></div>
																		<h6 className="card-title text-manga-medium-gray">
																			Generating Panel {panel.panelNumber}...
																		</h6>
																		<p className="card-text text-sm text-manga-medium-gray/80">
																			{panel.sceneDescription}
																		</p>
																	</>
																) : (
																	<>
																		<h6 className="card-title text-manga-medium-gray">
																			Panel {panel.panelNumber}
																		</h6>
																		<p className="card-text text-sm text-manga-medium-gray/80">
																			Waiting to generate...
																		</p>
																		<p className="card-text text-xs text-manga-medium-gray/60 mt-2">
																			{panel.sceneDescription}
																		</p>
																	</>
																)}
															</div>
														</div>
													);
												}
											})}
										</div>
										<div className="mt-3">
											<RerunButton
												onClick={() => retryFromStep("panels")}
												isLoading={isRerunningPanels}
												disabled={
													isGenerating ||
													!storyAnalysis ||
													!storyBreakdown ||
													characterReferences.length === 0
												}
											/>
										</div>
									</div>
								) : (
									<div>
										<p className="text-manga-medium-gray">
											Your finished comic panels will appear here after the
											layout is planned!
										</p>
										{failedStep === "panels" &&
											storyAnalysis &&
											characterReferences.length > 0 &&
											storyBreakdown && (
												<button
													type="button"
													className="px-3 py-1 text-sm border border-manga-info text-manga-info rounded hover:bg-manga-info hover:text-white transition-colors mt-2"
													onClick={() => retryFromStep("panels")}
													disabled={isGenerating || isLoadingReddit}
												>
													Retry Panel Generation
												</button>
											)}
									</div>
								)}
							</AccordionSection>

							{/* Step 5: Create Shareable Image */}
							<AccordionSection
								id={compositorHeadingId}
								title="Create Shareable Image"
								stepNumber={5}
								isCompleted={false}
								isOpen={openAccordions.has("compositor")}
								onToggle={() => toggleAccordionSection("compositor")}
								showStatus={false}
							>
								{hasCompositeContent ? (
									<div>
										<div className="flex justify-between items-center mb-3">
											<h5 className="font-semibold">
												Create Shareable Comic Page
											</h5>
											<DownloadButton
												onClick={() =>
													generateCompositeImage(compositorRef.current)
												}
												isLoading={isGeneratingComposite}
												label="Generate & Download"
												loadingText="Creating composite..."
												variant="outline"
											/>
										</div>

										{/* Hidden compositor layout for html2canvas */}
										<ShareableComicLayout
											storyAnalysis={storyAnalysis}
											generatedPanels={generatedPanels}
											characterReferences={characterReferences}
											style={style}
											isPreview={false}
											compositorRef={compositorRef}
										/>

										{/* Preview (visible version) */}
										<div className="bg-gray-50 p-4 rounded-lg border-2 border-dashed border-gray-300">
											<div className="text-center text-gray-600 mb-4">
												<p className="text-xs text-gray-500">
													Click "Generate & Download" to create your shareable
													comic page
												</p>
											</div>

											{/* Mini preview using the same component */}
											<ShareableComicLayout
												storyAnalysis={storyAnalysis}
												generatedPanels={generatedPanels}
												characterReferences={characterReferences}
												style={style}
												isPreview={true}
											/>
										</div>
									</div>
								) : (
									<div>
										<p className="text-manga-medium-gray">
											Complete all previous steps to create a shareable social
											media composite of your comic and characters.
										</p>
									</div>
								)}
							</AccordionSection>
						</div>
					</div>
				</div>
			</div>

			{/* Floating Report Issue Button */}
			<button
				type="button"
				onClick={() => setIsReportModalOpen(true)}
				className="floating-report-btn"
				title="Report an issue"
			>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
					<title>Report Issue Icon</title>
					<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v-6h-2v6zm0-8h2V7h-2v2z" />
				</svg>
				Report Issue
			</button>

			{/* Report Issue Modal */}
			<ReportIssueModal
				isOpen={isReportModalOpen}
				onClose={() => setIsReportModalOpen(false)}
			/>

			{/* Image Modal */}
			{modalImage && (
				<div
					className="image-modal-overlay"
					onClick={closeImageModal}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							closeImageModal();
						}
					}}
					role="dialog"
					aria-modal="true"
					aria-label="Image viewer"
					tabIndex={-1}
				>
					<div
						className="image-modal-content"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
						role="document"
					>
						<button
							type="button"
							className="image-modal-close"
							onClick={closeImageModal}
							aria-label="Close modal"
						>
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								aria-hidden="true"
							>
								<title>Close</title>
								<path d="M18 6L6 18M6 6l12 12" />
							</svg>
						</button>
						<img src={modalImage} alt={modalAlt} className="image-modal-img" />
					</div>
				</div>
			)}

			{/* Error Modal */}
			{showErrorModal && (
				<div
					className="confirmation-modal-overlay"
					onClick={closeErrorModal}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							closeErrorModal();
						}
					}}
					role="dialog"
					aria-modal="true"
					aria-label="Error message"
					tabIndex={-1}
				>
					<div
						className="confirmation-modal-content"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
						role="document"
					>
						<div className="confirmation-modal-header">
							<div className="confirmation-modal-icon text-manga-danger">
								<svg
									width="48"
									height="48"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									aria-hidden="true"
								>
									<title>Error</title>
									<path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
								</svg>
							</div>
							<h3 className="confirmation-modal-title text-manga-danger">
								Error
							</h3>
							<p className="confirmation-modal-message whitespace-pre-line">
								{errorModalMessage}
							</p>
						</div>
						<div className="confirmation-modal-actions">
							{errorRetryCallback && (
								<button
									type="button"
									className="btn-manga-outline"
									onClick={() => {
										errorRetryCallback();
										closeErrorModal();
									}}
								>
									Retry
								</button>
							)}
							<button
								type="button"
								className="btn-manga-primary confirmation-modal-confirm"
								onClick={closeErrorModal}
							>
								OK
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Confirmation Modal */}
			{showConfirmClearModal && (
				<div
					className="confirmation-modal-overlay"
					onClick={cancelClearData}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							cancelClearData();
						}
					}}
					role="dialog"
					aria-modal="true"
					aria-label="Confirm clear data"
					tabIndex={-1}
				>
					<div
						className="confirmation-modal-content"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
						role="document"
					>
						<div className="confirmation-modal-header">
							<div className="confirmation-modal-icon">
								<svg
									width="48"
									height="48"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									aria-hidden="true"
								>
									<title>Warning</title>
									<path d="M12 9v4M12 17h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" />
								</svg>
							</div>
							<h3 className="confirmation-modal-title">
								Clear All Saved Data?
							</h3>
							<p className="confirmation-modal-message">
								Are you sure you want to clear all saved data? This will delete
								your story, characters, and panels permanently. This action
								cannot be undone.
							</p>
						</div>
						<div className="confirmation-modal-actions">
							<button
								type="button"
								className="btn-manga-outline confirmation-modal-cancel"
								onClick={cancelClearData}
							>
								Cancel
							</button>
							<button
								type="button"
								className="btn-manga-primary confirmation-modal-confirm"
								onClick={confirmClearAllData}
							>
								🗑️ Clear All Data
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
