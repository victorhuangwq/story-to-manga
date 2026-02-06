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
				className={`accordion-body overflow-hidden transition-all duration-300 ease-out ${
					isOpen
						? "max-h-[5000px] opacity-100"
						: "max-h-0 opacity-0 py-0 border-0"
				}`}
				style={{
					display: isOpen ? "block" : "none",
				}}
			>
				<div className={`transition-transform duration-300 ${isOpen ? "translate-y-0" : "-translate-y-2"}`}>
					{children}
				</div>
			</div>
		</div>
	);
}
