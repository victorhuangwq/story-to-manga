import DownloadButton from "./DownloadButton";

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

export default function PanelCard({
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
