import type React from "react";

interface CollapsibleSectionProps {
	title: string;
	isExpanded: boolean;
	onToggle: () => void;
	children: React.ReactNode;
	badge?: string | undefined;
}

export default function CollapsibleSection({
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
