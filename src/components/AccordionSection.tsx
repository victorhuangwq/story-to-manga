import type React from "react";
import StatusBadge from "./StatusBadge";

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

export default function AccordionSection({
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
			<div
				className="accordion-body"
				style={{ display: isOpen ? "block" : "none" }}
			>
				{children}
			</div>
		</div>
	);
}
