import posthog from "posthog-js";

const posthogKey = process.env["NEXT_PUBLIC_POSTHOG_KEY"];

if (posthogKey) {
	posthog.init(posthogKey, {
		api_host: "/ingest",
		ui_host: "https://us.posthog.com",
		defaults: "2025-05-24",
		capture_exceptions: true, // This enables capturing exceptions using Error Tracking
		session_recording: {
			// Prevent large base64 images from being serialized into recordings
			blockClass: "ph-no-capture",
			blockSelector: ".ph-no-capture",
		},
		debug: process.env.NODE_ENV === "development",
	});
} else if (process.env.NODE_ENV === "development") {
	console.warn("PostHog: NEXT_PUBLIC_POSTHOG_KEY is not defined");
}
