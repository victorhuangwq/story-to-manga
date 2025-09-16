import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
	UploadedCharacterReference,
	UploadedSettingReference,
} from "@/types";

interface UploadState {
	uploadedCharacterReferences: UploadedCharacterReference[];
	uploadedSettingReferences: UploadedSettingReference[];
}

interface UploadActions {
	// Character reference actions
	addCharacterReference: (reference: UploadedCharacterReference) => void;
	removeCharacterReference: (id: string) => void;
	updateCharacterReferenceName: (id: string, name: string) => void;

	// Setting reference actions
	addSettingReference: (reference: UploadedSettingReference) => void;
	removeSettingReference: (id: string) => void;
	updateSettingReferenceName: (id: string, name: string) => void;

	// Bulk actions
	setUploadedCharacterReferences: (
		references: UploadedCharacterReference[],
	) => void;
	setUploadedSettingReferences: (
		references: UploadedSettingReference[],
	) => void;

	// Reset
	resetUploads: () => void;
}

const initialState: UploadState = {
	uploadedCharacterReferences: [],
	uploadedSettingReferences: [],
};

export const useUploadStore = create<UploadState & UploadActions>()(
	persist(
		(set) => ({
			...initialState,

			// Character reference actions
			addCharacterReference: (reference) =>
				set((state) => ({
					uploadedCharacterReferences: [
						...state.uploadedCharacterReferences,
						reference,
					],
				})),
			removeCharacterReference: (id) =>
				set((state) => ({
					uploadedCharacterReferences: state.uploadedCharacterReferences.filter(
						(ref) => ref.id !== id,
					),
				})),
			updateCharacterReferenceName: (id, name) =>
				set((state) => ({
					uploadedCharacterReferences: state.uploadedCharacterReferences.map(
						(ref) => (ref.id === id ? { ...ref, name } : ref),
					),
				})),

			// Setting reference actions
			addSettingReference: (reference) =>
				set((state) => ({
					uploadedSettingReferences: [
						...state.uploadedSettingReferences,
						reference,
					],
				})),
			removeSettingReference: (id) =>
				set((state) => ({
					uploadedSettingReferences: state.uploadedSettingReferences.filter(
						(ref) => ref.id !== id,
					),
				})),
			updateSettingReferenceName: (id, name) =>
				set((state) => ({
					uploadedSettingReferences: state.uploadedSettingReferences.map(
						(ref) => (ref.id === id ? { ...ref, name } : ref),
					),
				})),

			// Bulk actions
			setUploadedCharacterReferences: (uploadedCharacterReferences) =>
				set({ uploadedCharacterReferences }),
			setUploadedSettingReferences: (uploadedSettingReferences) =>
				set({ uploadedSettingReferences }),

			// Reset
			resetUploads: () => set(initialState),
		}),
		{
			name: "upload-store",
			partialize: (state) => ({
				uploadedCharacterReferences: state.uploadedCharacterReferences,
				uploadedSettingReferences: state.uploadedSettingReferences,
			}),
		},
	),
);
