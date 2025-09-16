import { useEffect } from "react";

interface UseModalEscapeProps {
	modalImage: string | null;
	showConfirmClearModal: boolean;
	showErrorModal: boolean;
	closeImageModal: () => void;
	cancelClearData: () => void;
	closeErrorModal: () => void;
}

export function useModalEscape(props: UseModalEscapeProps) {
	const {
		modalImage,
		showConfirmClearModal,
		showErrorModal,
		closeImageModal,
		cancelClearData,
		closeErrorModal,
	} = props;

	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (showErrorModal) {
					closeErrorModal();
				} else if (showConfirmClearModal) {
					cancelClearData();
				} else if (modalImage) {
					closeImageModal();
				}
			}
		};

		if (modalImage || showConfirmClearModal || showErrorModal) {
			document.addEventListener("keydown", handleEscape);
			return () => document.removeEventListener("keydown", handleEscape);
		}
	}, [
		modalImage,
		showConfirmClearModal,
		showErrorModal,
		closeImageModal,
		cancelClearData,
		closeErrorModal,
	]);
}
