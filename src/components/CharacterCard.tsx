import DownloadButton from "./DownloadButton";

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

export default function CharacterCard({
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
