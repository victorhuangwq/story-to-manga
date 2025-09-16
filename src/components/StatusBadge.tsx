interface StatusBadgeProps {
	status: "pending" | "completed" | "in-progress";
}

export default function StatusBadge({ status }: StatusBadgeProps) {
	const statusConfig = {
		pending: { class: "badge-manga-warning", text: "pending" },
		completed: { class: "badge-manga-success", text: "completed" },
		"in-progress": { class: "badge-manga-info", text: "in-progress" },
	};

	const config = statusConfig[status];

	return <span className={`${config.class} ml-auto mr-3`}>{config.text}</span>;
}
