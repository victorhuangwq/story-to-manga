// === Core Types ===

export type ComicStyle = 'manga' | 'comic';

export type CameraAngle = 
  | 'close-up'
  | 'medium shot' 
  | 'wide shot'
  | 'extreme close-up'
  | 'establishing shot'
  | 'over-the-shoulder'
  | "bird's eye view"
  | 'low angle'
  | 'high angle';

export type VisualMood = 
  | 'dramatic'
  | 'peaceful' 
  | 'tense'
  | 'mysterious'
  | 'comedic'
  | 'action-packed'
  | 'romantic'
  | 'melancholic'
  | 'energetic'
  | 'ominous';

// === Domain Types ===

export interface Character {
  name: string;
  physicalDescription: string;
  personality: string;
  role: string;
}

export interface Setting {
  timePeriod: string;
  location: string;
  mood: string;
}

export interface StoryAnalysis {
  characters: Character[];
  setting: Setting;
}

export interface CharacterReference {
  name: string;
  image: string; // base64 data URL
  description: string;
}

export interface Panel {
  panelNumber: number;
  characters: string[];
  sceneDescription: string;
  dialogue?: string;
  cameraAngle: string;
  visualMood: string;
}

export interface ComicPage {
  pageNumber: number;
  panelLayout: string;
  panels: Panel[];
}

export interface StoryBreakdown {
  pages: ComicPage[];
}

export interface GeneratedComicPage {
  pageNumber: number;
  image: string; // base64 data URL
  panelLayout: string;
}

// === API Request/Response Types ===

export interface AnalyzeStoryRequest {
  story: string;
  style: ComicStyle;
}

export interface AnalyzeStoryResponse {
  success: true;
  analysis: StoryAnalysis;
  wordCount: number;
}

export interface ChunkStoryRequest {
  story: string;
  characters: Character[];
  setting: Setting;
  style: ComicStyle;
}

export interface ChunkStoryResponse {
  success: true;
  storyBreakdown: StoryBreakdown;
}

export interface GenerateCharacterRefsRequest {
  characters: Character[];
  setting: Setting;
  style: ComicStyle;
}

export interface GenerateCharacterRefsResponse {
  success: true;
  characterReferences: CharacterReference[];
}

export interface GenerateComicPageRequest {
  page: ComicPage;
  characterReferences: CharacterReference[];
  setting: Setting;
  style: ComicStyle;
}

export interface GenerateComicPageResponse {
  success: true;
  comicPage: GeneratedComicPage;
}

// === UI State Types ===

export type GenerationStep = 
  | 'idle' 
  | 'analyzing' 
  | 'generating-characters' 
  | 'chunking' 
  | 'generating-pages' 
  | 'complete' 
  | 'error';

export type StepStatus = 'pending' | 'in-progress' | 'completed' | 'error';

export interface GenerationState {
  currentStep: GenerationStep;
  currentStepText: string;
  storyAnalysis: StoryAnalysis | null;
  characterReferences: CharacterReference[];
  storyBreakdown: StoryBreakdown | null;
  generatedPages: GeneratedComicPage[];
  error: string | null;
}