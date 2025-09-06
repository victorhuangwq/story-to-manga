"use client";

import JSZip from "jszip";
import { useCallback, useEffect, useId, useState } from "react";
import type {
	CharacterReference,
	ComicStyle,
	GeneratedPanel,
	StoryAnalysis,
	StoryBreakdown,
} from "@/types";

type FailedStep = "analysis" | "characters" | "layout" | "panels" | null;

export default function Home() {
	// Generate unique IDs for form elements
	const mangaRadioId = useId();
	const comicRadioId = useId();
	const storyTextareaId = useId();
	const analysisHeadingId = useId();
	const charactersHeadingId = useId();
	const layoutHeadingId = useId();
	const panelsHeadingId = useId();

	// Main state
	const [story, setStory] = useState("");
	const [style, setStyle] = useState<ComicStyle>("manga");
	const [isGenerating, setIsGenerating] = useState(false);
	const [currentStepText, setCurrentStepText] = useState("");

	// Modal state
	const [modalImage, setModalImage] = useState<string | null>(null);
	const [modalAlt, setModalAlt] = useState<string>("");

	// Download state
	const [isDownloadingCharacters, setIsDownloadingCharacters] = useState(false);
	const [isDownloadingPanels, setIsDownloadingPanels] = useState(false);

	// Generated content state
	const [storyAnalysis, setStoryAnalysis] = useState<StoryAnalysis | null>(
		null,
	);
	const [characterReferences, setCharacterReferences] = useState<
		CharacterReference[]
	>([]);
	const [storyBreakdown, setStoryBreakdown] = useState<StoryBreakdown | null>(
		null,
	);
	const [generatedPanels, setGeneratedPanels] = useState<GeneratedPanel[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [failedStep, setFailedStep] = useState<FailedStep>(null);

	// Accordion state
	const [openAccordion, setOpenAccordion] = useState<string>("analysis");

	const wordCount = story
		.trim()
		.split(/\s+/)
		.filter((word) => word.length > 0).length;

	const generateComic = async () => {
		if (!story.trim()) {
			setError("Please enter a story");
			return;
		}

		if (wordCount > 500) {
			setError("Story must be 500 words or less");
			return;
		}

		// Only reset error and set generating state - keep existing content visible
		setIsGenerating(true);
		setCurrentStepText("Analyzing your story...");
		setError(null);

		try {
			// Step 1: Analyze story
			const analysisResponse = await fetch("/api/analyze-story", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ story, style }),
			});

			if (!analysisResponse.ok) {
				throw new Error("Failed to analyze story");
			}

			const { analysis } = await analysisResponse.json();
			setStoryAnalysis(analysis);
			setOpenAccordion("analysis"); // Auto-expand analysis section

			// Step 2: Generate character references
			setCurrentStepText("Creating character designs...");
			const charRefResponse = await fetch("/api/generate-character-refs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					characters: analysis.characters,
					setting: analysis.setting,
					style,
				}),
			});

			if (!charRefResponse.ok) {
				throw new Error("Failed to generate character references");
			}

			const { characterReferences } = await charRefResponse.json();
			setCharacterReferences(characterReferences);
			setOpenAccordion("characters"); // Auto-expand characters section

			// Step 3: Break down story into panels
			setCurrentStepText("Planning comic layout...");
			const storyBreakdownResponse = await fetch("/api/chunk-story", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					story,
					characters: analysis.characters,
					setting: analysis.setting,
					style,
				}),
			});

			if (!storyBreakdownResponse.ok) {
				throw new Error("Failed to break down story");
			}

			const { storyBreakdown: breakdown } = await storyBreakdownResponse.json();
			setStoryBreakdown(breakdown);
			setOpenAccordion("layout"); // Auto-expand layout section

			// Step 4: Generate comic panels
			const panels: GeneratedPanel[] = [];

			for (let i = 0; i < breakdown.panels.length; i++) {
				const panel = breakdown.panels[i];
				setCurrentStepText(
					`Generating panel ${i + 1}/${breakdown.panels.length}...`,
				);

				const panelResponse = await fetch("/api/generate-panel", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						panel,
						characterReferences,
						setting: analysis.setting,
						style,
					}),
				});

				if (!panelResponse.ok) {
					throw new Error(`Failed to generate panel ${i + 1}`);
				}

				const { generatedPanel } = await panelResponse.json();
				panels.push(generatedPanel);
				setGeneratedPanels([...panels]);

				// Auto-expand panels section after first panel is generated
				if (i === 0) {
					setOpenAccordion("panels");
				}
			}

			setCurrentStepText("Complete! 🎉");
			setIsGenerating(false);
		} catch (error) {
			console.error("Generation error:", error);
			const errorMessage =
				error instanceof Error ? error.message : "Generation failed";
			setError(errorMessage);
			setIsGenerating(false);

			// Determine which step failed based on current progress
			if (!storyAnalysis) {
				setFailedStep("analysis");
			} else if (characterReferences.length === 0) {
				setFailedStep("characters");
			} else if (!storyBreakdown) {
				setFailedStep("layout");
			} else {
				setFailedStep("panels");
			}
		}
	};

	const downloadImage = (imageUrl: string, filename: string) => {
		const link = document.createElement("a");
		link.href = imageUrl;
		link.download = filename;
		link.click();
	};

	const downloadImagesAsZip = async (
		images: { url: string; filename: string }[],
		zipFilename: string,
	) => {
		const zip = new JSZip();

		// Fetch all images and add to zip
		const promises = images.map(async ({ url, filename }) => {
			try {
				const response = await fetch(url);
				const blob = await response.blob();
				zip.file(filename, blob);
			} catch (error) {
				console.error(`Failed to fetch image: ${filename}`, error);
			}
		});

		await Promise.all(promises);

		// Generate zip file and download
		const zipBlob = await zip.generateAsync({ type: "blob" });
		const zipUrl = URL.createObjectURL(zipBlob);

		const link = document.createElement("a");
		link.href = zipUrl;
		link.download = zipFilename;
		link.click();

		// Clean up
		setTimeout(() => URL.revokeObjectURL(zipUrl), 100);
	};

	const downloadAllPanels = async () => {
		setIsDownloadingPanels(true);
		try {
			const images = generatedPanels.map((panel) => ({
				url: panel.image,
				filename: `comic-panel-${panel.panelNumber}.jpg`,
			}));
			await downloadImagesAsZip(images, "comic-panels.zip");
		} finally {
			setIsDownloadingPanels(false);
		}
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

	const downloadAllCharacters = async () => {
		setIsDownloadingCharacters(true);
		try {
			const images = characterReferences.map((char) => ({
				url: char.image,
				filename: `character-${char.name.toLowerCase().replace(/\s+/g, "-")}.jpg`,
			}));
			await downloadImagesAsZip(images, "character-designs.zip");
		} finally {
			setIsDownloadingCharacters(false);
		}
	};

	const openImageModal = useCallback((imageUrl: string, altText: string) => {
		setModalImage(imageUrl);
		setModalAlt(altText);
	}, []);

	const closeImageModal = useCallback(() => {
		setModalImage(null);
		setModalAlt("");
	}, []);

	// Handle escape key for modal
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape" && modalImage) {
				closeImageModal();
			}
		};

		if (modalImage) {
			document.addEventListener("keydown", handleEscape);
			return () => document.removeEventListener("keydown", handleEscape);
		}
	}, [modalImage, closeImageModal]);

	const clearResults = () => {
		setStoryAnalysis(null);
		setCharacterReferences([]);
		setStoryBreakdown(null);
		setGeneratedPanels([]);
		setError(null);
		setFailedStep(null);
	};

	// Retry functions for individual steps
	const retryFromStep = async (step: FailedStep) => {
		if (!step) return;

		setIsGenerating(true);
		setError(null);
		setFailedStep(null);

		try {
			switch (step) {
				case "analysis":
					await retryAnalysis();
					break;
				case "characters":
					if (storyAnalysis) await retryCharacters();
					break;
				case "layout":
					if (storyAnalysis && characterReferences.length > 0)
						await retryLayout();
					break;
				case "panels":
					if (storyAnalysis && characterReferences.length > 0 && storyBreakdown)
						await retryPanels();
					break;
			}

			setCurrentStepText("Complete! 🎉");
			setIsGenerating(false);
		} catch (error) {
			console.error("Retry error:", error);
			setError(error instanceof Error ? error.message : "Retry failed");
			setIsGenerating(false);
			setFailedStep(step);
		}
	};

	const retryAnalysis = async () => {
		setCurrentStepText("Retrying story analysis...");
		const response = await fetch("/api/analyze-story", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ story, style }),
		});

		if (!response.ok) {
			throw new Error("Failed to analyze story");
		}

		const { analysis } = await response.json();
		setStoryAnalysis(analysis);
		setOpenAccordion("analysis"); // Auto-expand analysis section on retry
	};

	const retryCharacters = async () => {
		if (!storyAnalysis) throw new Error("Story analysis required");

		setCurrentStepText("Retrying character generation...");
		const response = await fetch("/api/generate-character-refs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				characters: storyAnalysis.characters,
				setting: storyAnalysis.setting,
				style,
			}),
		});

		if (!response.ok) {
			throw new Error("Failed to generate character references");
		}

		const { characterReferences } = await response.json();
		setCharacterReferences(characterReferences);
		setOpenAccordion("characters"); // Auto-expand characters section on retry
	};

	const retryLayout = async () => {
		if (!storyAnalysis) throw new Error("Story analysis required");

		setCurrentStepText("Retrying comic layout...");
		const response = await fetch("/api/chunk-story", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				story,
				characters: storyAnalysis.characters,
				setting: storyAnalysis.setting,
				style,
			}),
		});

		if (!response.ok) {
			throw new Error("Failed to break down story");
		}

		const { storyBreakdown: breakdown } = await response.json();
		setStoryBreakdown(breakdown);
		setOpenAccordion("layout"); // Auto-expand layout section on retry
	};

	const retryPanels = async () => {
		if (!storyAnalysis || !storyBreakdown || characterReferences.length === 0) {
			throw new Error("Previous steps required");
		}

		const panels: GeneratedPanel[] = [];

		for (let i = 0; i < storyBreakdown.panels.length; i++) {
			const panel = storyBreakdown.panels[i];
			setCurrentStepText(
				`Retrying panel ${i + 1}/${storyBreakdown.panels.length}...`,
			);

			const response = await fetch("/api/generate-panel", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					panel,
					characterReferences,
					setting: storyAnalysis.setting,
					style,
				}),
			});

			if (!response.ok) {
				throw new Error(`Failed to generate panel ${i + 1}`);
			}

			const { generatedPanel } = await response.json();
			panels.push(generatedPanel);
			setGeneratedPanels([...panels]);

			// Auto-expand panels section after first panel is generated
			if (i === 0) {
				setOpenAccordion("panels");
			}
		}
	};

	return (
		<div className={`min-h-screen py-4 px-4 style-${style}`}>
			{/* Top navigation with logo */}
			<div className="mb-4 flex items-center gap-3">
				<a
					href="/"
					className="inline-flex items-center hover:opacity-80 transition-opacity"
					title="Story to Manga Generator - Home"
				>
					<img
						src="/logo.png"
						alt="Story to Manga Generator Logo"
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
							Transform your stories into stunning visual comics with AI. Simply
							write your story, choose a style, and watch as your narrative
							comes to life panel by panel.
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
									onChange={() => setStyle("manga")}
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
									onChange={() => setStyle("comic")}
								/>
								<label
									className="btn-manga-outline flex-1 text-center cursor-pointer rounded-r-lg"
									htmlFor={comicRadioId}
								>
									American Comic
								</label>
							</fieldset>
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
								onChange={(e) => setStory(e.target.value)}
								placeholder="Enter your story here... (max 500 words)"
								disabled={isGenerating}
							/>
							{wordCount > 500 && (
								<div className="text-manga-danger text-sm mt-1">
									Story is too long. Please reduce to 500 words or less.
								</div>
							)}
						</div>

						{/* Error Display */}
						{error && (
							<div
								className="bg-manga-danger/10 border border-manga-danger text-manga-danger p-3 rounded mb-4"
								role="alert"
							>
								<strong>Error:</strong> {error}
								{failedStep && (
									<div className="mt-2">
										<button
											type="button"
											className="px-3 py-1 text-sm border border-manga-danger text-manga-danger rounded hover:bg-manga-danger hover:text-white transition-colors"
											onClick={() => retryFromStep(failedStep)}
											disabled={isGenerating}
										>
											Retry from{" "}
											{failedStep.charAt(0).toUpperCase() + failedStep.slice(1)}{" "}
											Step
										</button>
									</div>
								)}
							</div>
						)}

						{/* Generate Button */}
						<button
							type="button"
							className="btn-manga-primary w-full mb-2"
							onClick={generateComic}
							disabled={isGenerating || !story.trim() || wordCount > 500}
						>
							{isGenerating ? (
								<>
									<span
										className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"
										aria-hidden="true"
									></span>
									{currentStepText}
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
								className="btn-manga-outline w-full"
								onClick={clearResults}
								disabled={isGenerating}
							>
								Clear Previous Results
							</button>
						)}
					</div>
				</div>

				{/* Right Panel - Generation Results */}
				<div className="w-full lg:w-2/3">
					<div className="comic-panel h-full">
						<h2 className="text-xl mb-4">Behind the Scenes</h2>

						<div className="accordion-manga space-y-4">
							{/* Step 1: Story Analysis */}
							<div className="accordion-item">
								<h2 className="accordion-header" id={analysisHeadingId}>
									<button
										className="accordion-button"
										type="button"
										onClick={() =>
											setOpenAccordion(
												openAccordion === "analysis" ? "" : "analysis",
											)
										}
									>
										<span className="mr-2">{storyAnalysis ? "✅" : "⏳"}</span>
										Step 1: Story Analysis
										<span
											className={`badge-manga-${storyAnalysis ? "success" : "warning"} ml-auto mr-3`}
										>
											{storyAnalysis ? "completed" : "pending"}
										</span>
									</button>
								</h2>
								<div
									className={`accordion-body ${openAccordion === "analysis" ? "" : "hidden"}`}
								>
									{storyAnalysis ? (
										<div>
											<h5 className="font-semibold mb-2">Characters:</h5>
											<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
												{storyAnalysis.characters.map((char) => (
													<div key={char.name} className="card-manga">
														<div className="card-body">
															<h6 className="card-title">{char.name}</h6>
															<p className="card-text text-sm">
																{char.physicalDescription}
															</p>
															<p className="card-text">
																<em>{char.role}</em>
															</p>
														</div>
													</div>
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
													disabled={isGenerating}
												>
													Retry Story Analysis
												</button>
											)}
										</div>
									)}
								</div>
							</div>

							{/* Step 2: Character Designs */}
							<div className="accordion-item">
								<h2 className="accordion-header" id={charactersHeadingId}>
									<button
										className="accordion-button"
										type="button"
										onClick={() =>
											setOpenAccordion(
												openAccordion === "characters" ? "" : "characters",
											)
										}
									>
										<span className="mr-2">
											{characterReferences.length > 0 ? "✅" : "⏳"}
										</span>
										Step 2: Character Designs
										<span
											className={`badge-manga-${characterReferences.length > 0 ? "success" : "warning"} ml-auto mr-3`}
										>
											{characterReferences.length > 0 ? "completed" : "pending"}
										</span>
									</button>
								</h2>
								<div
									className={`accordion-body ${openAccordion === "characters" ? "" : "hidden"}`}
								>
									{characterReferences.length > 0 ? (
										<div className="character-grid">
											<div className="flex justify-between items-center mb-3">
												<h5 className="font-semibold">Character Designs</h5>
												<button
													type="button"
													className="btn-manga-primary"
													onClick={downloadAllCharacters}
													disabled={isDownloadingCharacters}
												>
													{isDownloadingCharacters ? (
														<>
															<span
																className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"
																aria-hidden="true"
															></span>
															Creating zip...
														</>
													) : (
														"Download All Characters"
													)}
												</button>
											</div>
											<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
												{characterReferences.map((char) => (
													<div key={char.name} className="text-center">
														<img
															src={char.image}
															alt={char.name}
															className="w-full h-48 object-cover rounded mb-2 border-2 border-manga-black shadow-comic transition-transform hover:scale-105 cursor-pointer"
															onClick={() =>
																openImageModal(char.image, char.name)
															}
															onKeyDown={(e) => {
																if (e.key === "Enter" || e.key === " ") {
																	e.preventDefault();
																	openImageModal(char.image, char.name);
																}
															}}
														/>
														<h6 className="font-semibold">{char.name}</h6>
														<p className="text-sm text-manga-medium-gray mb-2">
															{char.description}
														</p>
														<button
															type="button"
															className="btn-manga-outline text-sm"
															onClick={() => downloadCharacter(char)}
														>
															Download Character
														</button>
													</div>
												))}
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
													disabled={isGenerating}
												>
													Retry Character Generation
												</button>
											)}
										</div>
									)}
								</div>
							</div>

							{/* Step 3: Comic Layout Plan */}
							<div className="accordion-item">
								<h2 className="accordion-header" id={layoutHeadingId}>
									<button
										className="accordion-button"
										type="button"
										onClick={() =>
											setOpenAccordion(
												openAccordion === "layout" ? "" : "layout",
											)
										}
									>
										<span className="mr-2">{storyBreakdown ? "✅" : "⏳"}</span>
										Step 3: Comic Layout Plan
										<span
											className={`badge-manga-${storyBreakdown ? "success" : "warning"} ml-auto mr-3`}
										>
											{storyBreakdown ? "completed" : "pending"}
										</span>
									</button>
								</h2>
								<div
									className={`accordion-body ${openAccordion === "layout" ? "" : "hidden"}`}
								>
									{storyBreakdown ? (
										<div>
											<h5 className="font-semibold mb-2">
												Panel Sequence ({storyBreakdown.panels.length} panels)
											</h5>
											<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
												{storyBreakdown.panels.map((panel) => (
													<div
														key={`panel-${panel.panelNumber}`}
														className="card-manga"
													>
														<div className="card-body">
															<h6 className="card-title">
																Panel {panel.panelNumber}
															</h6>
															<p className="card-text text-sm">
																{panel.sceneDescription}
															</p>
															{panel.dialogue && (
																<p className="card-text speech-bubble text-sm">
																	"{panel.dialogue}"
																</p>
															)}
															<div className="text-sm text-manga-medium-gray">
																<div>
																	<strong>Characters:</strong>{" "}
																	{panel.characters.join(", ")}
																</div>
																<div>
																	<strong>Camera:</strong> {panel.cameraAngle}
																</div>
																<div>
																	<strong>Mood:</strong> {panel.visualMood}
																</div>
															</div>
														</div>
													</div>
												))}
											</div>
										</div>
									) : (
										<div>
											<p className="text-manga-medium-gray">
												Comic layout plan will appear here after character
												designs are complete.
											</p>
											{failedStep === "layout" &&
												storyAnalysis &&
												characterReferences.length > 0 && (
													<button
														type="button"
														className="px-3 py-1 text-sm border border-manga-info text-manga-info rounded hover:bg-manga-info hover:text-white transition-colors mt-2"
														onClick={() => retryFromStep("layout")}
														disabled={isGenerating}
													>
														Retry Comic Layout
													</button>
												)}
										</div>
									)}
								</div>
							</div>

							{/* Step 4: Generated Panels */}
							<div className="accordion-item">
								<h2 className="accordion-header" id={panelsHeadingId}>
									<button
										className="accordion-button"
										type="button"
										onClick={() =>
											setOpenAccordion(
												openAccordion === "panels" ? "" : "panels",
											)
										}
									>
										<span className="mr-2">
											{(() => {
												const expectedCount =
													storyBreakdown?.panels.length || 0;
												const currentCount = generatedPanels.length;
												if (currentCount === 0) return "⏳";
												if (currentCount === expectedCount && expectedCount > 0)
													return "✅";
												return "🔄";
											})()}
										</span>
										Step 4: Generated Panels
										<span
											className={`badge-manga-${(() => {
												const expectedCount =
													storyBreakdown?.panels.length || 0;
												const currentCount = generatedPanels.length;
												if (currentCount === 0) return "warning";
												if (currentCount === expectedCount && expectedCount > 0)
													return "success";
												return "info";
											})()} ml-auto mr-3`}
										>
											{(() => {
												const expectedCount =
													storyBreakdown?.panels.length || 0;
												const currentCount = generatedPanels.length;
												if (currentCount === 0) return "pending";
												if (currentCount === expectedCount && expectedCount > 0)
													return "completed";
												return "in-progress";
											})()}
										</span>
									</button>
								</h2>
								<div
									className={`accordion-body ${openAccordion === "panels" ? "" : "hidden"}`}
								>
									{generatedPanels.length > 0 ? (
										<div>
											<div className="flex justify-between items-center mb-3">
												<h5 className="font-semibold">Your Comic Panels</h5>
												<button
													type="button"
													className="btn-manga-primary"
													onClick={downloadAllPanels}
													disabled={isDownloadingPanels}
												>
													{isDownloadingPanels ? (
														<>
															<span
																className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"
																aria-hidden="true"
															></span>
															Creating zip...
														</>
													) : (
														"Download All Panels"
													)}
												</button>
											</div>
											<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
												{generatedPanels.map((panel) => (
													<div
														key={`generated-panel-${panel.panelNumber}`}
														className="text-center"
													>
														<img
															src={panel.image}
															alt={`Comic Panel ${panel.panelNumber}`}
															className="w-full rounded mb-2 comic-panel cursor-pointer transition-transform hover:scale-[1.02]"
															onClick={() =>
																openImageModal(
																	panel.image,
																	`Comic Panel ${panel.panelNumber}`,
																)
															}
															onKeyDown={(e) => {
																if (e.key === "Enter" || e.key === " ") {
																	e.preventDefault();
																	openImageModal(
																		panel.image,
																		`Comic Panel ${panel.panelNumber}`,
																	);
																}
															}}
														/>
														<h6 className="font-semibold">
															Panel {panel.panelNumber}
														</h6>
														<button
															type="button"
															className="btn-manga-outline text-sm"
															onClick={() => downloadPanel(panel)}
														>
															Download Panel
														</button>
													</div>
												))}
											</div>
										</div>
									) : (
										<div>
											<p className="text-manga-medium-gray">
												Your finished comic panels will appear here!
											</p>
											{failedStep === "panels" &&
												storyAnalysis &&
												characterReferences.length > 0 &&
												storyBreakdown && (
													<button
														type="button"
														className="px-3 py-1 text-sm border border-manga-info text-manga-info rounded hover:bg-manga-info hover:text-white transition-colors mt-2"
														onClick={() => retryFromStep("panels")}
														disabled={isGenerating}
													>
														Retry Panel Generation
													</button>
												)}
										</div>
									)}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Floating Report Issue Button */}
			<a
				href="https://github.com/victorhuangwq/story-to-manga/issues/new"
				target="_blank"
				rel="noopener noreferrer"
				className="floating-report-btn"
				title="Report an issue"
			>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
					<title>Report Issue Icon</title>
					<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v-6h-2v6zm0-8h2V7h-2v2z" />
				</svg>
				Report Issue
			</a>

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
		</div>
	);
}
