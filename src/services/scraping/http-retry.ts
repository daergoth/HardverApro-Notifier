import { logger } from "../logging/logger";
import { sleep } from "./async-utils";

function getHeader(error: unknown, name: string): unknown {
    const e: any = error as any;
    return e?.response?.headers?.[name];
}

function getStatus(error: unknown): number | undefined {
    const e: any = error as any;
    const status = e?.response?.status;
    return typeof status === "number" ? status : undefined;
}

function getErrorCode(error: unknown): string | undefined {
    const e: any = error as any;
    const code = e?.code;
    return typeof code === "string" ? code : undefined;
}

function isRetryableNetworkError(error: unknown): boolean {
    const code = getErrorCode(error);
    if (!code) {
        return false;
    }

    // Common transient network errors from Node/TLS/axios.
    // Keeping this list intentionally small to avoid retrying real failures indefinitely.
    const retryableCodes = new Set([
        "ECONNRESET",
        "ECONNREFUSED",
        "EPIPE",
        "ETIMEDOUT",
        "ENOTFOUND",
        "EAI_AGAIN",
        "EHOSTUNREACH",
        "ENETUNREACH",
    ]);

    return retryableCodes.has(code);
}

function getRetryAfterMs(error: unknown): number | undefined {
    const retryAfter = getHeader(error, "retry-after");
    if (!retryAfter) {
        return undefined;
    }

    const asNumber = Number.parseFloat(String(retryAfter));
    if (Number.isFinite(asNumber)) {
        // Retry-After is seconds (most common)
        return Math.max(0, Math.floor(asNumber * 1000));
    }

    const asDate = Date.parse(String(retryAfter));
    if (!Number.isNaN(asDate)) {
        return Math.max(0, asDate - Date.now());
    }

    return undefined;
}

/**
 * Retries a request on HTTP 429.
 * Uses Retry-After if present, otherwise exponential backoff + small jitter.
 */
export async function with429Retry<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            const status = getStatus(error);
            const isNetworkRetry = isRetryableNetworkError(error);

            const shouldRetry = status === 429 || isNetworkRetry;
            if (!shouldRetry || attempt === maxRetries) {
                throw error;
            }

            const headerDelay = getRetryAfterMs(error);
            const baseDelay = 1500 * Math.pow(2, attempt);
            const jitter = Math.floor(Math.random() * 500);
            const delayMs = Math.min(30_000, (headerDelay ?? baseDelay) + jitter);

            const reason = status === 429 ? "rate limited (429)" : `network error (${getErrorCode(error) ?? "unknown"})`;
            logger.warn(`Hardverapro request failed: ${reason}. Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
            await sleep(delayMs);
        }
    }

    throw lastError;
}
