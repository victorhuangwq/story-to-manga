import LoadingSpinner from "./LoadingSpinner";

interface RerunButtonProps {
	onClick: () => void;
	isLoading: boolean;
	disabled?: boolean;
	label?: string;
	loadingText?: string;
}

export default function RerunButton({
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
