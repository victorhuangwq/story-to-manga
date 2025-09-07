// === Core Types ===

export type ComicStyle = "manga" | "comic";

// === Domain Types ===

interface Character {
	name: string;
	physicalDescription: string;
	personality: string;
	role: string;
}

interface Setting {
	timePeriod: string;
	location: string;
	mood: string;
}

export interface StoryAnalysis {
	title: string;
	characters: Character[];
	setting: Setting;
}

export interface CharacterReference {
	name: string;
	image: string; // base64 data URL
	description: string;
}

export interface StoryBreakdown {
	panels: {
		panelNumber: number;
		characters: string[];
		sceneDescription: string;
		dialogue?: string;
		cameraAngle: string;
		visualMood: string;
	}[];
}

export interface GeneratedPanel {
	panelNumber: number;
	image: string; // base64 data URL
}
