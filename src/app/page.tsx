"use client";

import html2canvas from "html2canvas";
import JSZip from "jszip";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import ImageUpload from "@/components/ImageUpload";
import {
	trackDownload,
	trackError,
	trackEvent,
	trackMangaGeneration,
	trackPerformance,
} from "@/lib/analytics";
import {
	clearAllData,
	getStorageInfo,
	loadState,
	saveState,
} from "@/lib/storage";
import type {
	CharacterReference,
	ComicStyle,
	GeneratedPanel,
	StoryAnalysis,
	StoryBreakdown,
	UploadedCharacterReference,
	UploadedSettingReference,
} from "@/types";

type FailedStep = "analysis" | "characters" | "layout" | "panels" | null;
type FailedPanel = { step: "panel"; panelNumber: number } | null;

interface RerunButtonProps {
	onClick: () => void;
	isLoading: boolean;
	disabled?: boolean;
	label?: string;
	loadingText?: string;
}

function RerunButton({
	onClick,
	isLoading,
	disabled = false,
	label = "Re-run",
	loadingText = "Re-running...",
}: RerunButtonProps) {
	return (
		<button
			type="button"
			className="btn-manga-secondary"
			onClick={onClick}
			disabled={isLoading || disabled}
		>
			{isLoading ? (
				<>
					<LoadingSpinner size="small" />
					{loadingText}
				</>
			) : (
				`🔄 ${label}`
			)}
		</button>
	);
}

interface LoadingSpinnerProps {
	size?: "small" | "medium";
	color?: "white" | "current";
	className?: string;
}

function LoadingSpinner({
	size = "medium",
	color = "current",
	className = "",
}: LoadingSpinnerProps) {
	const sizeClasses = {
		small: "h-3 w-3",
		medium: "h-4 w-4",
	};

	const borderColorClasses = {
		white: "border-b-2 border-white",
		current: "border-b-2 border-current",
	};

	return (
		<span
			className={`inline-block animate-spin rounded-full ${sizeClasses[size]} ${borderColorClasses[color]} mr-2 ${className}`}
			aria-hidden="true"
		></span>
	);
}

interface DownloadButtonProps {
	onClick: () => void;
	isLoading: boolean;
	disabled?: boolean;
	label: string;
	loadingText: string;
	variant?: "primary" | "outline";
}

function DownloadButton({
	onClick,
	isLoading,
	disabled = false,
	label,
	loadingText,
	variant = "primary",
}: DownloadButtonProps) {
	const baseClass =
		variant === "primary" ? "btn-manga-primary" : "btn-manga-outline text-sm";

	return (
		<button
			type="button"
			className={baseClass}
			onClick={onClick}
			disabled={isLoading || disabled}
		>
			{isLoading ? (
				<>
					<LoadingSpinner
						size="small"
						color={variant === "primary" ? "white" : "current"}
					/>
					{loadingText}
				</>
			) : (
				label
			)}
		</button>
	);
}

interface StatusBadgeProps {
	status: "pending" | "completed" | "in-progress";
}

function StatusBadge({ status }: StatusBadgeProps) {
	const statusConfig = {
		pending: { class: "badge-manga-warning", text: "pending" },
		completed: { class: "badge-manga-success", text: "completed" },
		"in-progress": { class: "badge-manga-info", text: "in-progress" },
	};

	const config = statusConfig[status];

	return <span className={`${config.class} ml-auto mr-3`}>{config.text}</span>;
}

interface AccordionSectionProps {
	id: string;
	title: string;
	stepNumber: number;
	isCompleted: boolean;
	isInProgress?: boolean;
	isOpen: boolean;
	onToggle: () => void;
	children: React.ReactNode;
	showStatus?: boolean;
}

function AccordionSection({
	id,
	title,
	stepNumber,
	isCompleted,
	isInProgress = false,
	isOpen,
	onToggle,
	children,
	showStatus = true,
}: AccordionSectionProps) {
	const getStatusIcon = () => {
		if (!showStatus) return "";
		if (isCompleted) return "✅";
		if (isInProgress) return "🔄";
		return "⏳";
	};

	const getStatusBadge = () => {
		if (!showStatus) return null;
		if (isCompleted) return "completed";
		if (isInProgress) return "in-progress";
		return "pending";
	};

	return (
		<div className="accordion-item">
			<h2 className="accordion-header" id={id}>
				<button className="accordion-button" type="button" onClick={onToggle}>
					{getStatusIcon() && <span className="mr-2">{getStatusIcon()}</span>}
					Step {stepNumber}: {title}
					{getStatusBadge() && <StatusBadge status={getStatusBadge()!} />}
				</button>
			</h2>
			<div className={`accordion-body ${isOpen ? "" : "hidden"}`}>
				{children}
			</div>
		</div>
	);
}

interface CollapsibleSectionProps {
	title: string;
	isExpanded: boolean;
	onToggle: () => void;
	children: React.ReactNode;
	badge?: string | undefined;
}

function CollapsibleSection({
	title,
	isExpanded,
	onToggle,
	children,
	badge,
}: CollapsibleSectionProps) {
	return (
		<div className="border border-manga-medium-gray/30 rounded-lg">
			<button
				type="button"
				className="w-full flex items-center justify-between p-3 text-left hover:bg-manga-medium-gray/10 transition-colors rounded-t-lg"
				onClick={onToggle}
			>
				<div className="flex items-center gap-2">
					<span className="font-medium text-manga-black">{title}</span>
					{badge && (
						<span className="inline-block bg-manga-info text-white px-2 py-1 rounded text-xs">
							{badge}
						</span>
					)}
				</div>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					className={`transform transition-transform duration-200 ${
						isExpanded ? "rotate-180" : ""
					}`}
				>
					<title>Toggle section</title>
					<path d="m6 9 6 6 6-6" />
				</svg>
			</button>
			{isExpanded && (
				<div className="border-t border-manga-medium-gray/30 p-3">
					{children}
				</div>
			)}
		</div>
	);
}

interface CharacterCardProps {
	character: {
		name: string;
		physicalDescription?: string;
		role?: string;
		image?: string;
		description?: string;
	};
	showImage?: boolean;
	onImageClick?: (imageUrl: string, name: string) => void;
	onDownload?: () => void;
}

function CharacterCard({
	character,
	showImage = false,
	onImageClick,
	onDownload,
}: CharacterCardProps) {
	return (
		<div className={showImage ? "text-center" : "card-manga"}>
			{showImage && character.image ? (
				<>
					<img
						src={character.image}
						alt={character.name}
						className="w-full h-48 object-cover rounded mb-2 border-2 border-manga-black shadow-comic transition-transform hover:scale-105 cursor-pointer"
						onClick={() => onImageClick?.(character.image!, character.name)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onImageClick?.(character.image!, character.name);
							}
						}}
					/>
					<h6 className="font-semibold">{character.name}</h6>
					<p className="text-sm text-manga-medium-gray mb-2">
						{character.description}
					</p>
					{onDownload && (
						<DownloadButton
							onClick={onDownload}
							isLoading={false}
							label="Download Character"
							loadingText=""
							variant="outline"
						/>
					)}
				</>
			) : (
				<div className="card-body">
					<h6 className="card-title">{character.name}</h6>
					<p className="card-text text-sm">{character.physicalDescription}</p>
					<p className="card-text">
						<em>{character.role}</em>
					</p>
				</div>
			)}
		</div>
	);
}

interface PanelCardProps {
	panel: {
		panelNumber: number;
		sceneDescription?: string;
		dialogue?: string;
		characters?: string[];
		cameraAngle?: string;
		visualMood?: string;
		image?: string;
	};
	showImage?: boolean;
	onImageClick?: (imageUrl: string, altText: string) => void;
	onDownload?: () => void;
}

function PanelCard({
	panel,
	showImage = false,
	onImageClick,
	onDownload,
}: PanelCardProps) {
	return (
		<div className={showImage ? "text-center" : "card-manga"}>
			{showImage && panel.image ? (
				<>
					<img
						src={panel.image}
						alt={`Comic Panel ${panel.panelNumber}`}
						className="w-full rounded mb-2 comic-panel cursor-pointer transition-transform hover:scale-[1.02]"
						onClick={() =>
							onImageClick?.(panel.image!, `Comic Panel ${panel.panelNumber}`)
						}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onImageClick?.(
									panel.image!,
									`Comic Panel ${panel.panelNumber}`,
								);
							}
						}}
					/>
					<h6 className="font-semibold">Panel {panel.panelNumber}</h6>
					{onDownload && (
						<DownloadButton
							onClick={onDownload}
							isLoading={false}
							label="Download Panel"
							loadingText=""
							variant="outline"
						/>
					)}
				</>
			) : (
				<div className="card-body">
					<h6 className="card-title">Panel {panel.panelNumber}</h6>
					<p className="card-text text-sm">{panel.sceneDescription}</p>
					{panel.dialogue && (
						<p className="card-text speech-bubble text-sm">
							"{panel.dialogue}"
						</p>
					)}
					<div className="text-sm text-manga-medium-gray">
						{panel.characters && (
							<div>
								<strong>Characters:</strong> {panel.characters.join(", ")}
							</div>
						)}
						{panel.cameraAngle && (
							<div>
								<strong>Camera:</strong> {panel.cameraAngle}
							</div>
						)}
						{panel.visualMood && (
							<div>
								<strong>Mood:</strong> {panel.visualMood}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

interface ShareableComicLayoutProps {
	storyAnalysis: StoryAnalysis | null;
	generatedPanels: GeneratedPanel[];
	characterReferences: CharacterReference[];
	style: ComicStyle;
	isPreview?: boolean;
	compositorRef?: React.RefObject<HTMLDivElement | null>;
}

function ShareableComicLayout({
	storyAnalysis,
	generatedPanels,
	characterReferences,
	style,
	isPreview = false,
	compositorRef,
}: ShareableComicLayoutProps) {
	const title =
		storyAnalysis?.title || `${style === "manga" ? "Manga" : "Comic"} Story`;

	if (isPreview) {
		const panelsToShow = generatedPanels.slice(0, 4);
		const charactersToShow = characterReferences.slice(0, 3);
		const remainingPanels = Math.max(0, generatedPanels.length - 4);
		const remainingCharacters = Math.max(0, characterReferences.length - 3);

		// Simplified preview version
		return (
			<div className="max-w-sm mx-auto bg-white p-3 rounded shadow-sm">
				<div className="aspect-square bg-gray-100 rounded flex flex-col">
					<div className="text-center p-3 border-b">
						<div className="text-sm font-semibold truncate">{title}</div>
					</div>
					<div className="flex-1 flex">
						<div className="flex-1 grid grid-cols-2 gap-2 p-3 relative">
							{panelsToShow.map((panel) => (
								<div
									key={`preview-panel-${panel.panelNumber}`}
									className="bg-gray-200 rounded aspect-square"
								>
									<img
										src={panel.image}
										alt={`Panel ${panel.panelNumber}`}
										className="w-full h-full object-cover rounded"
									/>
								</div>
							))}
							{remainingPanels > 0 && (
								<div
									className="absolute bottom-2 right-2 text-[12px] px-2 py-1 rounded shadow-lg border"
									style={{
										backgroundColor: "rgba(255, 255, 255, 0.95)",
										color: "#000000",
									}}
								>
									+{remainingPanels} more
								</div>
							)}
						</div>
						<div className="w-16 p-2 relative">
							{charactersToShow.map((char) => (
								<div
									key={`preview-char-${char.name}`}
									className="bg-gray-200 rounded mb-1 aspect-square"
								>
									<img
										src={char.image}
										alt={char.name}
										className="w-full h-full object-cover rounded"
									/>
								</div>
							))}
							{remainingCharacters > 0 && (
								<div
									className="absolute bottom-2 right-2 text-[12px] px-2 py-1 rounded shadow-lg border"
									style={{
										backgroundColor: "rgba(255, 255, 255, 0.95)",
										color: "#000000",
									}}
								>
									+{remainingCharacters}
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		);
	}

	// Full download version
	return (
		<div
			ref={compositorRef}
			style={{
				position: "fixed",
				left: "-9999px",
				top: "0",
				width: "1200px",
				minHeight: "1200px", // Changed to minHeight to allow content to expand
				backgroundColor: "#ffffff",
				padding: "32px",
				fontFamily:
					style === "manga"
						? '"M PLUS 1", "Sawarabi Gothic", sans-serif'
						: '"Comfortaa", sans-serif',
			}}
		>
			{/* Header with title and branding */}
			<div style={{ textAlign: "center", marginBottom: "24px" }}>
				<h1
					style={{
						fontSize: "30px",
						fontWeight: "bold",
						color: "#1f2937",
						marginBottom: "8px",
						margin: "0 0 8px 0",
					}}
				>
					{title}
				</h1>
				<div
					style={{
						fontSize: "14px",
						color: "#6b7280",
						margin: "0",
					}}
				>
					Generated with Story to {style === "manga" ? "Manga" : "Comic"}{" "}
					Generator
				</div>
			</div>

			{/* Main content area */}
			<div style={{ display: "flex", height: "970px" }}>
				{/* Panels section - 75% width */}
				<div style={{ width: "75%", paddingRight: "16px" }}>
					<div
						style={{
							display: "grid",
							gap: "12px",
							height: "100%",
							gridTemplateColumns:
								generatedPanels.length <= 2
									? "1fr"
									: generatedPanels.length <= 4
										? "1fr 1fr"
										: generatedPanels.length <= 6
											? "1fr 1fr"
											: "1fr 1fr 1fr",
							gridTemplateRows:
								generatedPanels.length <= 2
									? "1fr 1fr"
									: generatedPanels.length <= 4
										? "1fr 1fr"
										: generatedPanels.length <= 6
											? "1fr 1fr 1fr"
											: "1fr 1fr",
						}}
					>
						{generatedPanels.map((panel) => (
							<div
								key={`composite-panel-${panel.panelNumber}`}
								style={{
									position: "relative",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									backgroundColor: "#f9fafb",
								}}
							>
								<img
									src={panel.image}
									alt={`Panel ${panel.panelNumber}`}
									style={{
										maxWidth: "100%",
										maxHeight: "100%",
										width: "auto",
										height: "auto",
										objectFit: "contain",
										borderRadius: "8px",
										border: "2px solid #d1d5db",
									}}
									crossOrigin="anonymous"
								/>
							</div>
						))}
					</div>
				</div>

				{/* Character showcase - 25% width */}
				<div
					style={{
						width: "25%",
						paddingLeft: "16px",
						borderLeft: "2px solid #e5e7eb",
					}}
				>
					<h3
						style={{
							fontSize: "18px",
							fontWeight: "600",
							color: "#1f2937",
							marginBottom: "16px",
							textAlign: "center",
							margin: "0 0 16px 0",
						}}
					>
						Characters
					</h3>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: "16px",
						}}
					>
						{characterReferences.slice(0, 3).map((char) => (
							<div
								key={`composite-char-${char.name}`}
								style={{ textAlign: "center" }}
							>
								<div
									style={{
										width: "200px",
										height: "200px",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										backgroundColor: "#f9fafb",
										borderRadius: "6px",
										border: "1px solid #d1d5db",
										marginBottom: "8px",
										margin: "0 auto 8px auto",
									}}
								>
									<img
										src={char.image}
										alt={char.name}
										style={{
											maxWidth: "100%",
											maxHeight: "100%",
											width: "auto",
											height: "auto",
											objectFit: "contain",
											borderRadius: "4px",
										}}
										crossOrigin="anonymous"
									/>
								</div>
								<div
									style={{
										fontSize: "11px",
										fontWeight: "500",
										color: "#374151",
										wordWrap: "break-word",
									}}
								>
									{char.name}
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

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
“Submit before you jinx it,” Kingston said.`;

export default function Home() {
	// Generate unique IDs for form elements
	const mangaRadioId = useId();
	const comicRadioId = useId();
	const storyTextareaId = useId();
	const analysisHeadingId = useId();
	const charactersHeadingId = useId();
	const layoutHeadingId = useId();
	const panelsHeadingId = useId();
	const compositorHeadingId = useId();

	// Ref for the compositor canvas
	const compositorRef = useRef<HTMLDivElement>(null);

	// Simple rate limit error handler
	const handleApiError = async (
		response: Response,
		defaultMessage: string,
	): Promise<string> => {
		if (response.status === 429) {
			try {
				const data = await response.json();
				const retryAfter = data.retryAfter || 60;
				return `Rate limit exceeded. Please wait ${retryAfter} seconds and try again.`;
			} catch {
				return "Rate limit exceeded. Please wait a minute and try again.";
			}
		}

		if (response.status === 400) {
			try {
				const data = await response.json();
				if (data.errorType === "PROHIBITED_CONTENT") {
					return `⚠️ Content Safety Issue: ${data.error}\n\nTip: Try modifying your story to remove potentially inappropriate content, violence, or mature themes.`;
				}
				return data.error || defaultMessage;
			} catch {
				return defaultMessage;
			}
		}

		return defaultMessage;
	};

	// Main state
	const [story, setStory] = useState("");
	const [style, setStyle] = useState<ComicStyle>("manga");
	const [isGenerating, setIsGenerating] = useState(false);
	const [currentStepText, setCurrentStepText] = useState("");

	// Uploaded reference images state
	const [uploadedCharacterReferences, setUploadedCharacterReferences] =
		useState<UploadedCharacterReference[]>([]);
	const [uploadedSettingReferences, setUploadedSettingReferences] = useState<
		UploadedSettingReference[]
	>([]);

	// Collapsible sections state
	const [isCharacterRefsExpanded, setIsCharacterRefsExpanded] = useState(false);
	const [isSettingRefsExpanded, setIsSettingRefsExpanded] = useState(false);

	// Modal state
	const [modalImage, setModalImage] = useState<string | null>(null);
	const [modalAlt, setModalAlt] = useState<string>("");
	const [showConfirmClearModal, setShowConfirmClearModal] =
		useState<boolean>(false);
	const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
	const [errorModalMessage, setErrorModalMessage] = useState<string>("");

	// Download state
	const [isDownloadingCharacters, setIsDownloadingCharacters] = useState(false);
	const [isDownloadingPanels, setIsDownloadingPanels] = useState(false);
	const [isGeneratingComposite, setIsGeneratingComposite] = useState(false);

	// Individual section re-run loading states
	const [isRerunningAnalysis, setIsRerunningAnalysis] = useState(false);
	const [isRerunningCharacters, setIsRerunningCharacters] = useState(false);
	const [isRerunningLayout, setIsRerunningLayout] = useState(false);
	const [isRerunningPanels, setIsRerunningPanels] = useState(false);

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
	const [failedPanel, setFailedPanel] = useState<FailedPanel>(null);

	// Storage state
	const [isLoadingState, setIsLoadingState] = useState(true);
	const [isSavingState, setIsSavingState] = useState(false);

	// Accordion state
	const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set());

	// Helper functions for accordion management
	const toggleAccordionSection = (section: string) => {
		setOpenAccordions((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(section)) {
				newSet.delete(section);
				trackEvent({
					action: "collapse_section",
					category: "user_interaction",
					label: section,
				});
			} else {
				newSet.add(section);
				trackEvent({
					action: "expand_section",
					category: "user_interaction",
					label: section,
				});
			}
			return newSet;
		});
	};

	const expandAllAccordions = () => {
		setOpenAccordions(
			new Set(["analysis", "characters", "layout", "panels", "compositor"]),
		);
	};

	const collapseAllAccordions = () => {
		setOpenAccordions(new Set());
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

	const generateComic = async () => {
		if (!story.trim()) {
			showError("Please enter a story");
			return;
		}

		if (wordCount > 500) {
			showError("Story must be 500 words or less");
			return;
		}

		// Track generation start
		const generationStartTime = Date.now();
		trackEvent({
			action: "start_generation",
			category: "manga_generation",
			label: style,
			value: wordCount,
		});

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
				throw new Error(
					await handleApiError(analysisResponse, "Failed to analyze story"),
				);
			}

			const { analysis } = await analysisResponse.json();
			setStoryAnalysis(analysis);
			setOpenAccordions(new Set(["analysis"])); // Auto-expand analysis section

			// Step 2: Generate character references
			setCurrentStepText("Creating character designs...");
			const charRefResponse = await fetch("/api/generate-character-refs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					characters: analysis.characters,
					setting: analysis.setting,
					style,
					uploadedCharacterReferences,
				}),
			});

			if (!charRefResponse.ok) {
				throw new Error(
					await handleApiError(
						charRefResponse,
						"Failed to generate character references",
					),
				);
			}

			const { characterReferences } = await charRefResponse.json();
			setCharacterReferences(characterReferences);
			setOpenAccordions(new Set(["characters"])); // Auto-expand characters section

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
				throw new Error(
					await handleApiError(
						storyBreakdownResponse,
						"Failed to break down story",
					),
				);
			}

			const { storyBreakdown: breakdown } = await storyBreakdownResponse.json();
			setStoryBreakdown(breakdown);
			setOpenAccordions(new Set(["layout"])); // Auto-expand layout section

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
						uploadedSettingReferences,
					}),
				});

				if (!panelResponse.ok) {
					const errorMessage = await handleApiError(
						panelResponse,
						`Failed to generate panel ${i + 1}`,
					);
					trackError(
						"panel_generation_failed",
						`Panel ${i + 1}: ${errorMessage}`,
					);
					// Store which panel failed
					setFailedPanel({ step: "panel", panelNumber: i + 1 });
					throw new Error(errorMessage);
				}

				const { generatedPanel } = await panelResponse.json();
				panels.push(generatedPanel);
				setGeneratedPanels([...panels]);

				// Auto-expand panels section after first panel is generated
				if (i === 0) {
					setOpenAccordions(new Set(["panels"]));
					// Track time to first panel
					const timeToFirstPanel = Date.now() - generationStartTime;
					trackPerformance("time_to_first_panel", timeToFirstPanel);
				}
			}

			setCurrentStepText("Complete! 🎉");
			setIsGenerating(false);

			// Track successful generation
			const generationTime = Date.now() - generationStartTime;
			trackMangaGeneration(wordCount, panels.length);
			trackPerformance("total_generation_time", generationTime);
		} catch (error) {
			console.error("Generation error:", error);
			const errorMessage =
				error instanceof Error ? error.message : "Generation failed";
			showError(errorMessage);
			setIsGenerating(false);

			// Track error
			trackError("generation_failed", errorMessage);

			// Determine which step failed based on current progress
			if (!storyAnalysis) {
				setFailedStep("analysis");
			} else if (characterReferences.length === 0) {
				setFailedStep("characters");
			} else if (!storyBreakdown) {
				setFailedStep("layout");
			} else {
				setFailedStep("panels");
				// Note: failedPanel is already set in the panel generation loop
			}
		}
	};

	const downloadImage = (imageUrl: string, filename: string) => {
		const link = document.createElement("a");
		link.href = imageUrl;
		link.download = filename;
		link.click();
		trackDownload("png");
	};

	// Uploaded reference image handlers
	const handleCharacterReferenceAdd = (image: UploadedCharacterReference) => {
		setUploadedCharacterReferences((prev) => [...prev, image]);
		trackEvent({
			action: "upload_character_reference",
			category: "user_interaction",
		});
	};

	const handleCharacterReferenceRemove = (id: string) => {
		setUploadedCharacterReferences((prev) =>
			prev.filter((img) => img.id !== id),
		);
	};

	const handleCharacterReferenceNameChange = (id: string, name: string) => {
		setUploadedCharacterReferences((prev) =>
			prev.map((img) => (img.id === id ? { ...img, name } : img)),
		);
	};

	const handleSettingReferenceAdd = (image: UploadedSettingReference) => {
		setUploadedSettingReferences((prev) => [...prev, image]);
		trackEvent({
			action: "upload_setting_reference",
			category: "user_interaction",
		});
	};

	const handleSettingReferenceRemove = (id: string) => {
		setUploadedSettingReferences((prev) => prev.filter((img) => img.id !== id));
	};

	const handleSettingReferenceNameChange = (id: string, name: string) => {
		setUploadedSettingReferences((prev) =>
			prev.map((img) => (img.id === id ? { ...img, name } : img)),
		);
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
			trackDownload("zip");
			trackEvent({
				action: "download_all_panels",
				category: "user_interaction",
				value: generatedPanels.length,
			});
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
			trackDownload("zip");
			trackEvent({
				action: "download_all_characters",
				category: "user_interaction",
				value: characterReferences.length,
			});
		} finally {
			setIsDownloadingCharacters(false);
		}
	};

	const openImageModal = useCallback((imageUrl: string, altText: string) => {
		setModalImage(imageUrl);
		setModalAlt(altText);
		trackEvent({
			action: "open_image_modal",
			category: "user_interaction",
			label: altText,
		});
	}, []);

	const closeImageModal = useCallback(() => {
		setModalImage(null);
		setModalAlt("");
	}, []);

	// Cancel clearing data
	const cancelClearData = useCallback(() => {
		setShowConfirmClearModal(false);
	}, []);

	// Handle error modal
	const closeErrorModal = useCallback(() => {
		setShowErrorModal(false);
		setErrorModalMessage("");
	}, []);

	const showError = useCallback((message: string) => {
		setError(message);
		setErrorModalMessage(message);
		setShowErrorModal(true);
	}, []);

	// Handle escape key for modals
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (showErrorModal) {
					closeErrorModal();
				} else if (showConfirmClearModal) {
					cancelClearData();
				} else if (modalImage) {
					closeImageModal();
				}
			}
		};

		if (modalImage || showConfirmClearModal || showErrorModal) {
			document.addEventListener("keydown", handleEscape);
			return () => document.removeEventListener("keydown", handleEscape);
		}
	}, [
		modalImage,
		showConfirmClearModal,
		showErrorModal,
		closeImageModal,
		cancelClearData,
		closeErrorModal,
	]);

	const clearResults = () => {
		setStoryAnalysis(null);
		setCharacterReferences([]);
		setStoryBreakdown(null);
		setGeneratedPanels([]);
		setError(null);
		setFailedStep(null);
		setFailedPanel(null);
		setUploadedCharacterReferences([]);
		setUploadedSettingReferences([]);
	};

	// Retry functions for individual steps
	const retryFromStep = async (step: FailedStep) => {
		if (!step) return;

		trackEvent({
			action: "retry_from_step",
			category: "user_interaction",
			label: step,
		});

		setIsGenerating(true);
		setError(null);
		setFailedStep(null);
		setFailedPanel(null);

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
			showError(error instanceof Error ? error.message : "Retry failed");
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
			throw new Error(
				await handleApiError(response, "Failed to analyze story"),
			);
		}

		const { analysis } = await response.json();
		setStoryAnalysis(analysis);
		setOpenAccordions(new Set(["analysis"])); // Auto-expand analysis section on retry
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
				uploadedCharacterReferences,
			}),
		});

		if (!response.ok) {
			throw new Error(
				await handleApiError(
					response,
					"Failed to generate character references",
				),
			);
		}

		const { characterReferences } = await response.json();
		setCharacterReferences(characterReferences);
		setOpenAccordions(new Set(["characters"])); // Auto-expand characters section on retry
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
			throw new Error(
				await handleApiError(response, "Failed to break down story"),
			);
		}

		const { storyBreakdown: breakdown } = await response.json();
		setStoryBreakdown(breakdown);
		setOpenAccordions(new Set(["layout"])); // Auto-expand layout section on retry
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
					uploadedSettingReferences,
				}),
			});

			if (!response.ok) {
				const errorMessage = await handleApiError(
					response,
					`Failed to generate panel ${i + 1}`,
				);
				setFailedPanel({ step: "panel", panelNumber: i + 1 });
				throw new Error(errorMessage);
			}

			const { generatedPanel } = await response.json();
			panels.push(generatedPanel);
			setGeneratedPanels([...panels]);

			// Auto-expand panels section after first panel is generated
			if (i === 0) {
				setOpenAccordions(new Set(["panels"]));
			}
		}
	};

	// Individual section re-run functions
	const rerunAnalysis = async () => {
		if (!story.trim()) return;

		trackEvent({
			action: "rerun_section",
			category: "user_interaction",
			label: "analysis",
		});

		setIsRerunningAnalysis(true);
		setError(null);

		try {
			setCurrentStepText("Re-analyzing your story...");
			const response = await fetch("/api/analyze-story", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ story, style }),
			});

			if (!response.ok) {
				throw new Error(
					await handleApiError(response, "Failed to re-analyze story"),
				);
			}

			const { analysis } = await response.json();
			setStoryAnalysis(analysis);
			setOpenAccordions(new Set(["analysis"]));
			setCurrentStepText("Analysis updated! 🎉");
		} catch (error) {
			console.error("Re-run analysis error:", error);
			showError(error instanceof Error ? error.message : "Re-analysis failed");
		} finally {
			setIsRerunningAnalysis(false);
		}
	};

	const rerunCharacterDesigns = async () => {
		if (!storyAnalysis) return;

		trackEvent({
			action: "rerun_section",
			category: "user_interaction",
			label: "characters",
		});

		setIsRerunningCharacters(true);
		setError(null);

		try {
			setCurrentStepText("Re-creating character designs...");
			const response = await fetch("/api/generate-character-refs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					characters: storyAnalysis.characters,
					setting: storyAnalysis.setting,
					style,
					uploadedCharacterReferences,
				}),
			});

			if (!response.ok) {
				throw new Error(
					await handleApiError(
						response,
						"Failed to regenerate character references",
					),
				);
			}

			const { characterReferences } = await response.json();
			setCharacterReferences(characterReferences);
			setOpenAccordions(new Set(["characters"]));
			setCurrentStepText("Character designs updated! 🎉");
		} catch (error) {
			console.error("Re-run characters error:", error);
			showError(
				error instanceof Error
					? error.message
					: "Character regeneration failed",
			);
		} finally {
			setIsRerunningCharacters(false);
		}
	};

	const rerunLayoutPlan = async () => {
		if (!storyAnalysis) return;

		trackEvent({
			action: "rerun_section",
			category: "user_interaction",
			label: "layout",
		});

		setIsRerunningLayout(true);
		setError(null);

		try {
			setCurrentStepText("Re-planning comic layout...");
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
				throw new Error(
					await handleApiError(
						response,
						"Failed to regenerate story breakdown",
					),
				);
			}

			const { storyBreakdown: breakdown } = await response.json();
			setStoryBreakdown(breakdown);
			setOpenAccordions(new Set(["layout"]));
			setCurrentStepText("Layout plan updated! 🎉");
		} catch (error) {
			console.error("Re-run layout error:", error);
			showError(
				error instanceof Error ? error.message : "Layout regeneration failed",
			);
		} finally {
			setIsRerunningLayout(false);
		}
	};

	const rerunPanels = async () => {
		if (!storyAnalysis || !storyBreakdown || characterReferences.length === 0) {
			return;
		}

		trackEvent({
			action: "rerun_section",
			category: "user_interaction",
			label: "panels",
		});

		setIsRerunningPanels(true);
		setError(null);
		setGeneratedPanels([]); // Clear existing panels

		try {
			const panels: GeneratedPanel[] = [];

			for (let i = 0; i < storyBreakdown.panels.length; i++) {
				const panel = storyBreakdown.panels[i];
				setCurrentStepText(
					`Re-generating panel ${i + 1}/${storyBreakdown.panels.length}...`,
				);

				const response = await fetch("/api/generate-panel", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						panel,
						characterReferences,
						setting: storyAnalysis.setting,
						style,
						uploadedSettingReferences,
					}),
				});

				if (!response.ok) {
					const errorMessage = await handleApiError(
						response,
						`Failed to regenerate panel ${i + 1}`,
					);
					throw new Error(errorMessage);
				}

				const { generatedPanel } = await response.json();
				panels.push(generatedPanel);
				setGeneratedPanels([...panels]);

				if (i === 0) {
					setOpenAccordions(new Set(["panels"]));
				}
			}

			setCurrentStepText("Panels updated! 🎉");
		} catch (error) {
			console.error("Re-run panels error:", error);
			showError(
				error instanceof Error ? error.message : "Panel regeneration failed",
			);
		} finally {
			setIsRerunningPanels(false);
		}
	};

	// Retry a specific panel that failed
	const retryFailedPanel = async (panelNumber: number) => {
		if (!storyAnalysis || !storyBreakdown || characterReferences.length === 0) {
			return;
		}

		const panelIndex = panelNumber - 1;
		const panel = storyBreakdown.panels[panelIndex];
		if (!panel) return;

		trackEvent({
			action: "retry_failed_panel",
			category: "user_interaction",
			label: `panel_${panelNumber}`,
		});

		setIsGenerating(true);
		setError(null);
		setFailedPanel(null);
		setCurrentStepText(`Retrying panel ${panelNumber}...`);

		try {
			const response = await fetch("/api/generate-panel", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					panel,
					characterReferences,
					setting: storyAnalysis.setting,
					style,
					uploadedSettingReferences,
				}),
			});

			if (!response.ok) {
				const errorMessage = await handleApiError(
					response,
					`Failed to regenerate panel ${panelNumber}`,
				);
				setFailedPanel({ step: "panel", panelNumber });
				throw new Error(errorMessage);
			}

			const { generatedPanel } = await response.json();

			// Update the panels array with the new panel
			const updatedPanels = [...generatedPanels];
			// Check if panel already exists in the array
			const existingIndex = updatedPanels.findIndex(
				(p) => p.panelNumber === panelNumber,
			);
			if (existingIndex >= 0) {
				updatedPanels[existingIndex] = generatedPanel;
			} else {
				// Insert at correct position
				updatedPanels.splice(panelIndex, 0, generatedPanel);
				updatedPanels.sort((a, b) => a.panelNumber - b.panelNumber);
			}
			setGeneratedPanels(updatedPanels);

			// Continue generating remaining panels if any
			const expectedCount = storyBreakdown.panels.length;
			if (updatedPanels.length < expectedCount) {
				for (let i = updatedPanels.length; i < expectedCount; i++) {
					const nextPanel = storyBreakdown.panels[i];
					setCurrentStepText(`Generating panel ${i + 1}/${expectedCount}...`);

					const nextResponse = await fetch("/api/generate-panel", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							panel: nextPanel,
							characterReferences,
							setting: storyAnalysis.setting,
							style,
							uploadedSettingReferences,
						}),
					});

					if (!nextResponse.ok) {
						const errorMessage = await handleApiError(
							nextResponse,
							`Failed to generate panel ${i + 1}`,
						);
						setFailedPanel({ step: "panel", panelNumber: i + 1 });
						throw new Error(errorMessage);
					}

					const { generatedPanel: nextGeneratedPanel } =
						await nextResponse.json();
					updatedPanels.push(nextGeneratedPanel);
					setGeneratedPanels([...updatedPanels]);
				}
			}

			setCurrentStepText("Complete! 🎉");
			setIsGenerating(false);
		} catch (error) {
			console.error("Retry panel error:", error);
			showError(error instanceof Error ? error.message : "Panel retry failed");
			setIsGenerating(false);
		}
	};

	// Comic compositor functionality
	const generateComposite = async () => {
		if (!compositorRef.current || generatedPanels.length === 0) return;

		setIsGeneratingComposite(true);
		try {
			// Debug: check the compositor element
			console.log("compositorRef.current:", compositorRef.current);
			console.log("Element dimensions:", {
				width: compositorRef.current?.offsetWidth,
				height: compositorRef.current?.offsetHeight,
				scrollWidth: compositorRef.current?.scrollWidth,
				scrollHeight: compositorRef.current?.scrollHeight,
			});

			const canvas = await html2canvas(compositorRef.current, {
				backgroundColor: "#ffffff",
				scale: 2, // Higher quality
				useCORS: true,
				allowTaint: false,
				logging: true, // Enable logging to see what's happening
				width: compositorRef.current.scrollWidth,
				height: compositorRef.current.scrollHeight, // Use actual content height
			});

			// Convert to blob and download
			canvas.toBlob((blob) => {
				if (blob) {
					const url = URL.createObjectURL(blob);
					const link = document.createElement("a");
					link.href = url;
					link.download = `comic-page-${style}-${Date.now()}.png`;
					link.click();
					URL.revokeObjectURL(url);
				}
			}, "image/png");
			trackEvent({
				action: "generate_composite",
				category: "user_interaction",
				label: style,
			});
		} catch (error) {
			console.error("Failed to generate composite:", error);
			showError("Failed to generate composite image");
			trackError(
				"composite_generation_failed",
				error instanceof Error ? error.message : "Unknown error",
			);
		} finally {
			setIsGeneratingComposite(false);
		}
	};

	const downloadStoryAnalysis = () => {
		if (!storyAnalysis) return;

		const exportData = {
			metadata: {
				title: "Story Analysis Export",
				exportDate: new Date().toISOString(),
				style: style,
				generatedBy: "Story to Manga Machine",
			},
			storyAnalysis: {
				title: storyAnalysis.title,
				characters: storyAnalysis.characters,
				setting: storyAnalysis.setting,
			},
		};

		const blob = new Blob([JSON.stringify(exportData, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `story-analysis-${Date.now()}.json`;
		link.click();
		URL.revokeObjectURL(url);
	};

	const downloadComicLayout = () => {
		if (!storyBreakdown || !storyAnalysis) return;

		const exportData = {
			metadata: {
				title: "Comic Layout Export",
				exportDate: new Date().toISOString(),
				style: style,
				generatedBy: "Story to Manga Machine",
			},
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
		};

		const blob = new Blob([JSON.stringify(exportData, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `comic-layout-${Date.now()}.json`;
		link.click();
		URL.revokeObjectURL(url);
	};

	// Load state on component mount
	useEffect(() => {
		const initializeApp = async () => {
			try {
				const savedState = await loadState();
				if (savedState) {
					setStory(savedState.story);
					setStyle(savedState.style);
					setStoryAnalysis(savedState.storyAnalysis);
					setCharacterReferences(savedState.characterReferences);
					setStoryBreakdown(savedState.storyBreakdown);
					setGeneratedPanels(savedState.generatedPanels);
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
	}, []);

	// Save state whenever important data changes
	useEffect(() => {
		if (isLoadingState) return; // Don't save while still loading

		const saveCurrentState = async () => {
			try {
				setIsSavingState(true);
				await saveState(
					story,
					style,
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
		storyAnalysis,
		storyBreakdown,
		characterReferences,
		generatedPanels,
		uploadedCharacterReferences,
		uploadedSettingReferences,
		isLoadingState,
	]);

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
			setCharacterReferences([]);
			setStoryBreakdown(null);
			setGeneratedPanels([]);
			setError(null);
			setFailedStep(null);
			setFailedPanel(null);
			setUploadedCharacterReferences([]);
			setUploadedSettingReferences([]);
			setOpenAccordions(new Set());
		} catch (error) {
			console.error("Failed to clear data:", error);
			showError("Failed to clear saved data");
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
							Transform your stories into stunning visual comics with{" "}
							<a
								href="https://ai.google.dev/gemini-api/docs/models#gemini-2.5-flash-image-preview"
								target="_blank"
								rel="noopener noreferrer"
								className="text-manga-info hover:underline"
							>
								Nano Banana (Gemini 2.5 Flash Image)
							</a>
							. Simply write your story, choose a style, and watch as your
							narrative comes to life panel by panel.
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
								disabled={isGenerating}
							/>
							{/* Try Sample Button - only show when story is empty or has very few words */}
							{wordCount < 10 && (
								<div className="mt-2">
									<button
										type="button"
										className="btn-manga-secondary text-sm"
										onClick={loadSampleText}
										disabled={isGenerating}
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
									images={uploadedCharacterReferences}
									onImageAdd={handleCharacterReferenceAdd}
									onImageRemove={handleCharacterReferenceRemove}
									onImageNameChange={handleCharacterReferenceNameChange}
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
									images={uploadedSettingReferences}
									onImageAdd={handleSettingReferenceAdd}
									onImageRemove={handleSettingReferenceRemove}
									onImageNameChange={handleSettingReferenceNameChange}
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
								{(failedStep || failedPanel) && (
									<div className="mt-2">
										{failedPanel ? (
											<button
												type="button"
												className="px-3 py-1 text-sm border border-manga-danger text-manga-danger rounded hover:bg-manga-danger hover:text-white transition-colors"
												onClick={() =>
													retryFailedPanel(failedPanel.panelNumber)
												}
												disabled={isGenerating}
											>
												Retry Panel {failedPanel.panelNumber}
											</button>
										) : failedStep ? (
											<button
												type="button"
												className="px-3 py-1 text-sm border border-manga-danger text-manga-danger rounded hover:bg-manga-danger hover:text-white transition-colors"
												onClick={() => retryFromStep(failedStep)}
												disabled={isGenerating}
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
								className="btn-manga-outline w-full mb-2"
								onClick={clearResults}
								disabled={isGenerating}
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
								disabled={isGenerating}
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
										collapseAllAccordions();
									} else {
										expandAllAccordions();
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
												onClick={rerunAnalysis}
												isLoading={isRerunningAnalysis}
												disabled={isGenerating}
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
												disabled={isGenerating}
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
								isCompleted={characterReferences.length > 0}
								isInProgress={
									isGenerating &&
									!!storyAnalysis &&
									characterReferences.length === 0 &&
									currentStepText.includes("character")
								}
								isOpen={openAccordions.has("characters")}
								onToggle={() => toggleAccordionSection("characters")}
								showStatus={isGenerating || characterReferences.length > 0}
							>
								{characterReferences.length > 0 ? (
									<div className="character-grid">
										<div className="flex justify-between items-center mb-3">
											<h5 className="font-semibold">Character Designs</h5>
											<DownloadButton
												onClick={downloadAllCharacters}
												isLoading={isDownloadingCharacters}
												label="Download All Characters"
												loadingText="Creating zip..."
												variant="outline"
											/>
										</div>
										<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
											{characterReferences.map((char) => (
												<CharacterCard
													key={char.name}
													character={char}
													showImage={true}
													onImageClick={openImageModal}
													onDownload={() => downloadCharacter(char)}
												/>
											))}
										</div>
										<div className="mt-3">
											<RerunButton
												onClick={rerunCharacterDesigns}
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
												disabled={isGenerating}
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
												onClick={rerunLayoutPlan}
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
													disabled={isGenerating}
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
													onClick={downloadAllPanels}
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
												onClick={rerunPanels}
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
													disabled={isGenerating}
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
												onClick={generateComposite}
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
