import DownloadButton from "./DownloadButton";
import LoadingSpinner from "./LoadingSpinner";
import RerunButton from "./RerunButton";

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
	onRegenerate?: () => void;
	isRegenerating?: boolean;
}

export default function CharacterCard({
	character,
	showImage = false,
	onImageClick,
	onDownload,
	onRegenerate,
	isRegenerating = false,
}: CharacterCardProps) {
	return (
		<div className={showImage ? "text-center ph-no-capture character-reveal" : "card-manga"}>
			{showImage && character.image ? (
				<>
					<div className="relative">
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
						{isRegenerating && (
							<div className="absolute inset-0 bg-black/50 backdrop-blur-sm rounded flex flex-col items-center justify-center transition-opacity duration-300">
								<LoadingSpinner size="large" color="white" />
								<span className="text-white text-sm font-medium mt-2">
									Regenerating...
								</span>
							</div>
						)}
					</div>
					<h6 className="font-semibold">{character.name}</h6>
					<p className="text-sm text-manga-medium-gray mb-2">
						{character.description}
					</p>
					<div className="flex gap-2 justify-center">
						{onDownload && (
							<DownloadButton
								onClick={onDownload}
								isLoading={false}
								label="Download Character"
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
