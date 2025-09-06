"use client";

import { useId, useState } from "react";
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
	const analysisCollapseId = useId();
	const charactersCollapseId = useId();
	const layoutCollapseId = useId();
	const panelsCollapseId = useId();
	const analysisHeadingId = useId();
	const charactersHeadingId = useId();
	const layoutHeadingId = useId();
	const panelsHeadingId = useId();

	// Main state
	const [story, setStory] = useState("");
	const [style, setStyle] = useState<ComicStyle>("manga");
	const [isGenerating, setIsGenerating] = useState(false);
	const [currentStepText, setCurrentStepText] = useState("");

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

	const downloadAllPanels = () => {
		generatedPanels.forEach((panel) => {
			downloadImage(panel.image, `comic-panel-${panel.panelNumber}.jpg`);
		});
	};

	const downloadPanel = (panel: GeneratedPanel) => {
		downloadImage(panel.image, `comic-panel-${panel.panelNumber}.jpg`);
	};

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
		}
	};

	return (
		<div className={`container-fluid min-vh-100 py-4 style-${style}`}>
			<div className="row h-100">
				{/* Left Panel - Input */}
				<div className="col-md-4 mb-4">
					<div className="comic-panel h-100 p-4">
						<h1 className="h2 text-center mb-4">
							Story to {style === "manga" ? "Manga" : "Comic"} Generator
						</h1>

						{/* Style Selection */}
						<div className="mb-3">
							<div className="form-label">Comic Style</div>
							<fieldset className="btn-group w-100">
								<input
									type="radio"
									className="btn-check"
									name="style"
									id={mangaRadioId}
									checked={style === "manga"}
									onChange={() => setStyle("manga")}
								/>
								<label className="btn btn-manga-outline" htmlFor={mangaRadioId}>
									Japanese Manga
								</label>

								<input
									type="radio"
									className="btn-check"
									name="style"
									id={comicRadioId}
									checked={style === "comic"}
									onChange={() => setStyle("comic")}
								/>
								<label className="btn btn-manga-outline" htmlFor={comicRadioId}>
									American Comic
								</label>
							</fieldset>
						</div>

						{/* Story Input */}
						<div className="mb-3">
							<label className="form-label" htmlFor={storyTextareaId}>
								Your Story{" "}
								<span className="badge bg-secondary">
									{wordCount}/500 words
								</span>
							</label>
							<textarea
								id={storyTextareaId}
								className="form-control form-control-manga"
								rows={8}
								value={story}
								onChange={(e) => setStory(e.target.value)}
								placeholder="Enter your story here... (max 500 words)"
								disabled={isGenerating}
							/>
							{wordCount > 500 && (
								<div className="form-text text-danger">
									Story is too long. Please reduce to 500 words or less.
								</div>
							)}
						</div>

						{/* Error Display */}
						{error && (
							<div className="alert alert-danger" role="alert">
								<strong>Error:</strong> {error}
								{failedStep && (
									<div className="mt-2">
										<button
											type="button"
											className="btn btn-sm btn-outline-danger"
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
							className="btn btn-manga-primary w-100 mb-2"
							onClick={generateComic}
							disabled={isGenerating || !story.trim() || wordCount > 500}
						>
							{isGenerating ? (
								<>
									<span
										className="spinner-border spinner-border-sm me-2"
										aria-hidden="true"
									></span>
									{currentStepText}
								</>
							) : (
								"Generate Comic"
							)}
						</button>

						{/* Clear Results Button */}
						{(storyAnalysis ||
							characterReferences.length > 0 ||
							storyBreakdown ||
							generatedPanels.length > 0) && (
							<button
								type="button"
								className="btn btn-manga-outline w-100"
								onClick={clearResults}
								disabled={isGenerating}
							>
								Clear Previous Results
							</button>
						)}
					</div>
				</div>

				{/* Right Panel - Generation Results */}
				<div className="col-md-8">
					<div className="comic-panel h-100 p-4">
						<h2 className="h3 mb-4">Behind the Scenes</h2>

						<div className="accordion accordion-manga">
							{/* Step 1: Story Analysis */}
							<div className="accordion-item">
								<h2 className="accordion-header" id={analysisHeadingId}>
									<button
										className="accordion-button"
										type="button"
										data-bs-toggle="collapse"
										data-bs-target={`#${analysisCollapseId}`}
									>
										<span className="me-2">{storyAnalysis ? "✅" : "⏳"}</span>
										Step 1: Story Analysis
										<span
											className={`badge ${storyAnalysis ? "badge-manga-success" : "badge-manga-warning"} ms-auto me-3`}
										>
											{storyAnalysis ? "completed" : "pending"}
										</span>
									</button>
								</h2>
								<div
									id={analysisCollapseId}
									className="accordion-collapse collapse show"
									data-bs-parent="#generationAccordion"
								>
									<div className="accordion-body">
										{storyAnalysis ? (
											<div>
												<h5>Characters:</h5>
												<div className="row">
													{storyAnalysis.characters.map((char) => (
														<div key={char.name} className="col-sm-6 mb-3">
															<div className="card card-manga">
																<div className="card-body">
																	<h6 className="card-title">{char.name}</h6>
																	<p className="card-text small">
																		{char.physicalDescription}
																	</p>
																	<p className="card-text">
																		<em>{char.role}</em>
																	</p>
																</div>
															</div>
														</div>
													))}
												</div>
												<h5 className="mt-3">Setting:</h5>
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
												<p className="text-muted">
													Story analysis will appear here once generation
													begins.
												</p>
												{failedStep === "analysis" && (
													<button
														type="button"
														className="btn btn-sm btn-outline-primary"
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
							</div>

							{/* Step 2: Character Designs */}
							<div className="accordion-item">
								<h2 className="accordion-header" id={charactersHeadingId}>
									<button
										className="accordion-button collapsed"
										type="button"
										data-bs-toggle="collapse"
										data-bs-target={`#${charactersCollapseId}`}
									>
										<span className="me-2">
											{characterReferences.length > 0 ? "✅" : "⏳"}
										</span>
										Step 2: Character Designs
										<span
											className={`badge ${characterReferences.length > 0 ? "badge-manga-success" : "badge-manga-warning"} ms-auto me-3`}
										>
											{characterReferences.length > 0 ? "completed" : "pending"}
										</span>
									</button>
								</h2>
								<div
									id={charactersCollapseId}
									className="accordion-collapse collapse"
									data-bs-parent="#generationAccordion"
								>
									<div className="accordion-body">
										{characterReferences.length > 0 ? (
											<div className="character-grid">
												<div className="row">
													{characterReferences.map((char) => (
														<div
															key={char.name}
															className="col-sm-6 col-lg-4 mb-3"
														>
															<div className="text-center">
																<img
																	src={char.image}
																	alt={char.name}
																	className="img-fluid rounded mb-2"
																	style={{
																		height: "200px",
																		objectFit: "cover",
																	}}
																/>
																<h6>{char.name}</h6>
																<p className="small text-muted">
																	{char.description}
																</p>
															</div>
														</div>
													))}
												</div>
											</div>
										) : (
											<div>
												<p className="text-muted">
													Character design images will appear here after story
													analysis.
												</p>
												{failedStep === "characters" && storyAnalysis && (
													<button
														type="button"
														className="btn btn-sm btn-outline-primary"
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
							</div>

							{/* Step 3: Comic Layout Plan */}
							<div className="accordion-item">
								<h2 className="accordion-header" id={layoutHeadingId}>
									<button
										className="accordion-button collapsed"
										type="button"
										data-bs-toggle="collapse"
										data-bs-target={`#${layoutCollapseId}`}
									>
										<span className="me-2">{storyBreakdown ? "✅" : "⏳"}</span>
										Step 3: Comic Layout Plan
										<span
											className={`badge ${storyBreakdown ? "badge-manga-success" : "badge-manga-warning"} ms-auto me-3`}
										>
											{storyBreakdown ? "completed" : "pending"}
										</span>
									</button>
								</h2>
								<div
									id={layoutCollapseId}
									className="accordion-collapse collapse"
									data-bs-parent="#generationAccordion"
								>
									<div className="accordion-body">
										{storyBreakdown ? (
											<div>
												<h5>
													Panel Sequence ({storyBreakdown.panels.length} panels)
												</h5>
												<div className="row">
													{storyBreakdown.panels.map((panel) => (
														<div
															key={`panel-${panel.panelNumber}`}
															className="col-sm-6 mb-3"
														>
															<div className="card card-manga">
																<div className="card-body">
																	<h6 className="card-title">
																		Panel {panel.panelNumber}
																	</h6>
																	<p className="card-text small">
																		{panel.sceneDescription}
																	</p>
																	{panel.dialogue && (
																		<p className="card-text speech-bubble small">
																			"{panel.dialogue}"
																		</p>
																	)}
																	<div className="small text-muted">
																		<div>
																			<strong>Characters:</strong>{" "}
																			{panel.characters.join(", ")}
																		</div>
																		<div>
																			<strong>Camera:</strong>{" "}
																			{panel.cameraAngle}
																		</div>
																		<div>
																			<strong>Mood:</strong> {panel.visualMood}
																		</div>
																	</div>
																</div>
															</div>
														</div>
													))}
												</div>
											</div>
										) : (
											<div>
												<p className="text-muted">
													Comic layout plan will appear here after character
													designs are complete.
												</p>
												{failedStep === "layout" &&
													storyAnalysis &&
													characterReferences.length > 0 && (
														<button
															type="button"
															className="btn btn-sm btn-outline-primary"
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
							</div>

							{/* Step 4: Generated Panels */}
							<div className="accordion-item">
								<h2 className="accordion-header" id={panelsHeadingId}>
									<button
										className="accordion-button collapsed"
										type="button"
										data-bs-toggle="collapse"
										data-bs-target={`#${panelsCollapseId}`}
									>
										<span className="me-2">
											{generatedPanels.length > 0 ? "✅" : "⏳"}
										</span>
										Step 4: Generated Panels
										<span
											className={`badge ${generatedPanels.length > 0 ? "badge-manga-success" : "badge-manga-warning"} ms-auto me-3`}
										>
											{generatedPanels.length > 0 ? "completed" : "pending"}
										</span>
									</button>
								</h2>
								<div
									id={panelsCollapseId}
									className="accordion-collapse collapse"
									data-bs-parent="#generationAccordion"
								>
									<div className="accordion-body">
										{generatedPanels.length > 0 ? (
											<div>
												<div className="d-flex justify-content-between align-items-center mb-3">
													<h5>Your Comic Panels</h5>
													<button
														type="button"
														className="btn btn-manga-primary"
														onClick={downloadAllPanels}
													>
														Download All Panels
													</button>
												</div>
												<div className="row">
													{generatedPanels.map((panel) => (
														<div
															key={`generated-panel-${panel.panelNumber}`}
															className="col-lg-6 mb-4"
														>
															<div className="text-center">
																<img
																	src={panel.image}
																	alt={`Comic Panel ${panel.panelNumber}`}
																	className="img-fluid rounded comic-panel mb-2"
																/>
																<h6>Panel {panel.panelNumber}</h6>
																<button
																	type="button"
																	className="btn btn-manga-outline btn-sm"
																	onClick={() => downloadPanel(panel)}
																>
																	Download Panel
																</button>
															</div>
														</div>
													))}
												</div>
											</div>
										) : (
											<div>
												<p className="text-muted">
													Your finished comic panels will appear here!
												</p>
												{failedStep === "panels" &&
													storyAnalysis &&
													characterReferences.length > 0 &&
													storyBreakdown && (
														<button
															type="button"
															className="btn btn-sm btn-outline-primary"
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
		</div>
	);
}
