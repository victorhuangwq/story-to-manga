import { sendGAEvent } from "@next/third-parties/google";

type EventCategory =
	| "manga_generation"
	| "user_interaction"
	| "error"
	| "performance";

interface CustomEvent {
	action: string;
	category: EventCategory;
	label?: string;
	value?: number;
}

export const trackEvent = ({ action, category, label, value }: CustomEvent) => {
	if (typeof window !== "undefined") {
		sendGAEvent("event", action, {
			event_category: category,
			event_label: label,
			value: value,
		});
	}
};

export const trackMangaGeneration = (
	storyLength: number,
	panelCount: number,
) => {
	trackEvent({
		action: "generate_manga",
		category: "manga_generation",
		label: `panels_${panelCount}`,
		value: storyLength,
	});
};

export const trackError = (errorType: string, errorMessage?: string) => {
	trackEvent({
		action: "error_occurred",
		category: "error",
		label: `${errorType}: ${errorMessage || "Unknown error"}`,
	});
};

export const trackDownload = (format: "png" | "zip") => {
	trackEvent({
		action: "download_manga",
		category: "user_interaction",
		label: format,
	});
};

export const trackPerformance = (metric: string, value: number) => {
	trackEvent({
		action: "performance_metric",
		category: "performance",
		label: metric,
		value: Math.round(value),
	});
};
