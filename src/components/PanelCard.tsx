import DownloadButton from "./DownloadButton";
import LoadingSpinner from "./LoadingSpinner";
import RerunButton from "./RerunButton";
import SpeechBubble from "./SpeechBubble";

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
	onRegenerate?: () => void;
	isRegenerating?: boolean;
}

export default function PanelCard({
	panel,
	showImage = false,
	onImageClick,
	onDownload,
	onRegenerate,
	isRegenerating = false,
}: PanelCardProps) {
	return (
		<div
			className={
				showImage ? "text-center ph-no-capture" : "card-manga"
			}
		>
			{showImage && panel.image ? (
				<>
					<div className="relative">
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
						{isRegenerating && (
							<div className="absolute inset-0 bg-black/50 backdrop-blur-sm rounded flex flex-col items-center justify-center transition-opacity duration-300">
								<LoadingSpinner size="large" color="white" />
								<span className="text-white text-sm font-medium mt-2">
									Regenerating...
								</span>
							</div>
						)}
					</div>
					<h6 className="font-semibold">Panel {panel.panelNumber}</h6>
					<div className="flex gap-2 justify-center mt-2">
						{onDownload && (
							<DownloadButton
								onClick={onDownload}
								isLoading={false}
								label="Download Panel"
								loadingText=""
								variant="outline"
							/>
						)}
						{onRegenerate && (
							<RerunButton
								onClick={onRegenerate}
								isLoading={isRegenerating}
								label="Regenerate"
								loadingText="Regenerating..."
								disabled={isRegenerating}
							/>
						)}
					</div>
				</>
			) : (
				<div className="card-body">
					<h6 className="card-title">Panel {panel.panelNumber}</h6>
					<p className="card-text text-sm">{panel.sceneDescription}</p>
					{panel.dialogue && (
						<div className="flex justify-center my-3">
							<SpeechBubble text={panel.dialogue} />
						</div>
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
