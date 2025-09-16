interface SpeechBubbleProps {
	text: string;
}

export default function SpeechBubble({ text }: SpeechBubbleProps) {
	// Calculate dynamic sizing based on text length
	const textLength = text.length;
	const minWidth = 150;
	const maxWidth = 400;
	const width = Math.min(maxWidth, Math.max(minWidth, textLength * 8 + 80));
	const height = Math.max(60, Math.ceil(textLength / 30) * 25 + 40);

	return (
		<div className="relative inline-block my-4 max-w-full">
			<svg
				viewBox={`0 0 ${width} ${height + 20}`}
				className="w-full h-auto"
				style={{ maxWidth: `${width}px` }}
			>
				<title>Speech bubble containing: {text}</title>
				{/* Single continuous speech bubble with tail */}
				<path
					d={`M 20 20
					   Q 10 20, 10 30
					   L 10 ${height - 30}
					   Q 10 ${height - 10}, 20 ${height - 10}
					   L 50 ${height - 10}
					   L 35 ${height + 15}
					   L 70 ${height - 10}
					   L ${width - 20} ${height - 10}
					   Q ${width - 10} ${height - 10}, ${width - 10} ${height - 20}
					   L ${width - 10} 30
					   Q ${width - 10} 20, ${width - 20} 20
					   Z`}
					fill="white"
					stroke="black"
					strokeWidth="2"
					strokeLinejoin="round"
				/>
			</svg>
			<div
				className="absolute inset-0 flex items-center justify-center px-6 py-3"
				style={{ top: "0px", paddingBottom: "20px" }}
			>
				<p className="text-sm text-center text-black font-medium leading-tight max-w-full overflow-hidden">
					"{text}"
				</p>
			</div>
		</div>
	);
}
