interface LoadingSpinnerProps {
	size?: "small" | "medium";
	color?: "white" | "current";
	className?: string;
}

export default function LoadingSpinner({
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
