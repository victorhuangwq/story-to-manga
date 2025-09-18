import { useId, useState } from "react";

interface ReportIssueModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export default function ReportIssueModal({
	isOpen,
	onClose,
}: ReportIssueModalProps) {
	const typeId = useId();
	const descriptionId = useId();

	const [type, setType] = useState<"bug" | "feature">("bug");
	const [description, setDescription] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitStatus, setSubmitStatus] = useState<
		"idle" | "success" | "error"
	>("idle");

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!description.trim()) {
			return;
		}

		setIsSubmitting(true);
		setSubmitStatus("idle");

		try {
			const response = await fetch("/api/report-issue", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					type,
					description: description.trim(),
					userAgent: navigator.userAgent,
				}),
			});

			if (response.ok) {
				setSubmitStatus("success");
				setTimeout(() => {
					setDescription("");
					setType("bug");
					setSubmitStatus("idle");
					onClose();
				}, 2000);
			} else {
				setSubmitStatus("error");
			}
		} catch (error) {
			console.error("Failed to submit issue:", error);
			setSubmitStatus("error");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			onClose();
		}
	};

	const handleOverlayKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			onClose();
		}
	};

	if (!isOpen) return null;

	return (
		<div
			className="modal-overlay"
			onClick={onClose}
			onKeyDown={handleOverlayKeyDown}
			role="dialog"
			aria-modal="true"
			tabIndex={-1}
		>
			<div
				className="modal-content report-issue-modal card-manga"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={handleKeyDown}
				role="document"
			>
				<div className="modal-header">
					<h2>Report an Issue</h2>
					<button type="button" className="modal-close" onClick={onClose}>
						×
					</button>
				</div>

				<form onSubmit={handleSubmit}>
					<div className="form-group">
						<label htmlFor={typeId}>Type</label>
						<select
							id={typeId}
							value={type}
							onChange={(e) => setType(e.target.value as "bug" | "feature")}
							className="form-select input-manga"
						>
							<option value="bug">🐛 Bug Report</option>
							<option value="feature">✨ Feature Request</option>
						</select>
					</div>

					<div className="form-group">
						<label htmlFor={descriptionId}>Description</label>
						<textarea
							id={descriptionId}
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder={
								type === "bug"
									? "Please describe the bug you encountered..."
									: "Please describe the feature you would like..."
							}
							className="form-textarea input-manga"
							rows={6}
							required
							disabled={isSubmitting}
						/>
					</div>

					{submitStatus === "success" && (
						<div className="alert alert-success">
							✓ Issue submitted successfully! Thank you for your feedback.
						</div>
					)}

					{submitStatus === "error" && (
						<div className="alert alert-error">
							Failed to submit issue. Please try again later.
						</div>
					)}

					<div className="modal-footer">
						<button
							type="button"
							onClick={onClose}
							className="btn-manga-outline"
							disabled={isSubmitting}
						>
							Cancel
						</button>
						<button
							type="submit"
							className="btn-manga-primary"
							disabled={isSubmitting || !description.trim()}
						>
							{isSubmitting ? "Submitting..." : "Submit"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
