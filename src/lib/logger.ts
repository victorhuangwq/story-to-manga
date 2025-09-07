import pino, { type Logger } from "pino";

// Create the base logger with environment-specific configuration
const logger: Logger =
	process.env.NODE_ENV === "production"
		? pino({
				level: "info",
				timestamp: pino.stdTimeFunctions.isoTime,
				formatters: {
					level: (label) => ({ level: label }),
				},
			})
		: pino({
				level: "debug",
				transport: {
					target: "pino-pretty",
					options: {
						colorize: true,
						translateTime: "HH:MM:ss",
						ignore: "pid,hostname",
					},
				},
			});

// Create module-specific loggers
const createModuleLogger = (module: string) => {
	return logger.child({ module });
};

// Pre-configured loggers for different parts of the app
export const storyAnalysisLogger = createModuleLogger("story-analysis");
export const characterGenLogger = createModuleLogger("character-generation");
export const storyChunkingLogger = createModuleLogger("story-chunking");
export const panelLogger = createModuleLogger("panel-generation");

// Helper function to log API request/response
export const logApiRequest = (
	logger: Logger,
	endpoint: string,
	method = "POST",
	metadata?: Record<string, unknown>,
) => {
	logger.info(
		{
			endpoint,
			method,
			timestamp: new Date().toISOString(),
			...metadata,
		},
		`API request: ${method} ${endpoint}`,
	);
};

export const logApiResponse = (
	logger: Logger,
	endpoint: string,
	success: boolean,
	duration?: number,
	metadata?: Record<string, unknown>,
) => {
	const logData = {
		endpoint,
		success,
		timestamp: new Date().toISOString(),
		...(duration && { duration_ms: duration }),
		...metadata,
	};

	if (success) {
		logger.info(logData, `API response: ${endpoint} completed successfully`);
	} else {
		logger.error(logData, `API response: ${endpoint} failed`);
	}
};

export const logError = (
	logger: Logger,
	error: Error | unknown,
	context: string,
	metadata?: Record<string, unknown>,
) => {
	const errorData = {
		context,
		timestamp: new Date().toISOString(),
		...(error instanceof Error && {
			error_name: error.name,
			error_message: error.message,
			error_stack: error.stack,
		}),
		...metadata,
	};

	logger.error(
		errorData,
		`Error in ${context}: ${error instanceof Error ? error.message : "Unknown error"}`,
	);
};
