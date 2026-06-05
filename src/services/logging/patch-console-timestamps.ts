import util from "util";

type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug" | "trace";

type PatchConsoleTimestampsOptions = {
	format?: "iso" | "locale";
};

const PATCH_FLAG_KEY = "__hardverapro_notifier_consoleTimestampPatched";

function getGlobalObject(): unknown {
	// Node 10 does not have globalThis.
	// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
	// @ts-ignore - global is provided by Node at runtime.
	if (typeof globalThis !== "undefined") return globalThis as unknown;
	// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
	// @ts-ignore - global is provided by Node at runtime.
	if (typeof global !== "undefined") return global as unknown;
	if (typeof self !== "undefined") return self as unknown;
	if (typeof window !== "undefined") return window as unknown;
	return {};
}

function makeTimestamp(format: NonNullable<PatchConsoleTimestampsOptions["format"]>): string {
	return format === "locale" ? new Date().toString() : new Date().toISOString();
}

export function patchConsoleTimestamps(options: PatchConsoleTimestampsOptions = {}): void {
	// TS 3.9 doesn't support symbol index signatures.
	// Use a stable string key to guard against double-patching.
	const root = getGlobalObject() as Record<string, unknown>;
	if (root[PATCH_FLAG_KEY]) return;
	root[PATCH_FLAG_KEY] = true;

	const format = options.format ?? "iso";
	const methods: ConsoleMethod[] = ["log", "info", "warn", "error", "debug", "trace"];

	for (const method of methods) {
		const original = (console as unknown as Record<string, unknown>)[method];
		if (typeof original !== "function") continue;

		(console as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
			const ts = makeTimestamp(format);

			// Keep Node's native console formatting (objects, Error stacks, etc.).
			// If a printf-style format string is used, preserve it.
			if (args.length > 0 && typeof args[0] === "string") {
				(original as (...a: unknown[]) => void).call(console, `[${ts}] ${args[0]}`, ...args.slice(1));
				return;
			}

			(original as (...a: unknown[]) => void).call(console, `[${ts}]`, ...args);
		};
	}

	// Ensure util import isn't tree-shaken in older TS setups; also validates module resolution.
	void util.format;
}
