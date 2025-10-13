"use client";

import { useCallback, useId, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { useUploadStore } from "@/stores/useUploadStore";

interface ImageUploadProps {
	title: string;
	description: string;
	type: "character" | "setting";
	accept?: string;
	maxSizeMB?: number;
	maxImages?: number;
}

export default function ImageUpload({
	title,
	description,
	type,
	accept = "image/*",
	maxSizeMB = 10,
	maxImages = 5,
}: ImageUploadProps) {
	const {
		uploadedCharacterReferences,
		uploadedSettingReferences,
		addCharacterReference,
		removeCharacterReference,
		updateCharacterReferenceName,
		addSettingReference,
		removeSettingReference,
		updateSettingReferenceName,
	} = useUploadStore();

	const images =
		type === "character"
			? uploadedCharacterReferences
			: uploadedSettingReferences;
	const onImageAdd =
		type === "character" ? addCharacterReference : addSettingReference;
	const onImageRemove =
		type === "character" ? removeCharacterReference : removeSettingReference;
	const onImageNameChange =
		type === "character"
			? updateCharacterReferenceName
			: updateSettingReferenceName;
	const fileInputId = useId();
	const [isDragging, setIsDragging] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const processFile = useCallback(
		(file: File) => {
			if (images.length >= maxImages) {
				setError(`Maximum ${maxImages} images allowed`);
				return;
			}

			if (file.size > maxSizeMB * 1024 * 1024) {
				setError(`File size must be less than ${maxSizeMB}MB`);
				return;
			}

			if (!file.type.startsWith("image/")) {
				setError("Please select an image file");
				return;
			}

			const reader = new FileReader();
			reader.onload = (e) => {
				const result = e.target?.result as string;
				if (result) {
					const id = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
					const newImage = {
						id,
						name: file.name.replace(/\.[^/.]+$/, ""), // Remove file extension for default name
						image: result,
						fileName: file.name,
					};
					onImageAdd(newImage);
					trackEvent({
						action: `upload_${type}_reference`,
						category: "user_interaction",
					});
					setError(null);
				}
			};
			reader.onerror = () => {
				setError("Failed to read file");
			};
			reader.readAsDataURL(file);
		},
		[images.length, maxImages, maxSizeMB, onImageAdd, type],
	);

	const handleFileSelect = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const files = event.target.files;
			if (files) {
				for (const file of Array.from(files)) {
					processFile(file);
				}
			}
			// Reset input value to allow selecting the same file again
			event.target.value = "";
		},
		[processFile],
	);

	const handleDragOver = useCallback((event: React.DragEvent) => {
		event.preventDefault();
		setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((event: React.DragEvent) => {
		event.preventDefault();
		setIsDragging(false);
	}, []);

	const handleDrop = useCallback(
		(event: React.DragEvent) => {
			event.preventDefault();
			setIsDragging(false);

			const files = event.dataTransfer.files;
			for (const file of Array.from(files)) {
				processFile(file);
			}
		},
		[processFile],
	);

	const handleNameChange = useCallback(
		(id: string, name: string) => {
			onImageNameChange(id, name);
		},
		[onImageNameChange],
	);

	return (
		<div className="space-y-3">
			<div className="flex justify-between items-center">
				<h4 className="font-semibold text-manga-black">{title}</h4>
				<span className="text-xs text-manga-medium-gray">
					{images.length}/{maxImages} images
				</span>
			</div>

			<p className="text-sm text-manga-medium-gray">{description}</p>

			{/* Upload Area */}
			<button
				type="button"
				className={`
					w-full border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
					${
						isDragging
							? "border-manga-info bg-manga-info/5"
							: "border-manga-medium-gray hover:border-manga-info hover:bg-manga-info/5"
					}
					${images.length >= maxImages ? "opacity-50 cursor-not-allowed" : ""}
				`}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				onClick={() => {
					if (images.length < maxImages) {
						document.getElementById(fileInputId)?.click();
					}
				}}
				disabled={images.length >= maxImages}
				aria-label={`Upload ${title.toLowerCase()}`}
			>
				<input
					id={fileInputId}
					type="file"
					accept={accept}
					multiple
					onChange={handleFileSelect}
					className="hidden"
					disabled={images.length >= maxImages}
				/>

				<div className="space-y-2">
					<div className="text-manga-black">
						{isDragging
							? "Drop images here"
							: "Click to browse or drag images here"}
					</div>
					<div className="text-xs text-manga-medium-gray">
						Max {maxSizeMB}MB per file • {maxImages} files max • JPG, PNG, WebP
					</div>
				</div>
			</button>

			{/* Error Message */}
			{error && (
				<div className="text-sm text-manga-danger bg-manga-danger/10 border border-manga-danger rounded p-2">
					{error}
				</div>
			)}

			{/* Uploaded Images */}
			{images.length > 0 && (
				<div className="space-y-3">
					<h5 className="font-medium text-manga-black">Uploaded Images:</h5>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						{images.map((image) => (
							<div key={image.id} className="card-manga ph-no-capture">
								<div className="card-body p-3">
									<div className="flex gap-3">
										{/* Image Preview */}
										<div className="flex-shrink-0">
											<img
												src={image.image}
												alt={image.name}
												className="w-16 h-16 object-cover rounded border-2 border-manga-black"
											/>
										</div>

										{/* Image Details */}
										<div className="flex-1 min-w-0">
											<input
												type="text"
												value={image.name}
												onChange={(e) =>
													handleNameChange(image.id, e.target.value)
												}
												className="form-control-manga text-sm mb-1 w-full"
												placeholder="Enter name/description"
											/>
											<div className="text-xs text-manga-medium-gray truncate">
												{image.fileName}
											</div>
										</div>

										{/* Remove Button */}
										<button
											type="button"
											onClick={() => onImageRemove(image.id)}
											className="flex-shrink-0 text-manga-danger hover:bg-manga-danger/10 rounded p-1 transition-colors"
											aria-label={`Remove ${image.name}`}
										>
											<svg
												width="16"
												height="16"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
											>
												<title>Remove image</title>
												<path d="M18 6L6 18M6 6l12 12" />
											</svg>
										</button>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
