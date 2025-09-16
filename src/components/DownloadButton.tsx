import LoadingSpinner from "./LoadingSpinner";

interface DownloadButtonProps {
	onClick: () => void;
	isLoading: boolean;
	disabled?: boolean;
	label: string;
	loadingText: string;
	variant?: "primary" | "outline";
}

export default function DownloadButton({
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
