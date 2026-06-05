export function formatError(error: unknown): string {
    if (error instanceof Error) {
        const anyErr: any = error as any;
        const status = anyErr?.response?.status;
        const code = anyErr?.code;
        const method = typeof anyErr?.config?.method === "string" ? anyErr.config.method.toUpperCase() : undefined;
        const url = typeof anyErr?.config?.url === "string" ? anyErr.config.url : undefined;
        const extra = [
            method && url ? `${method} ${url}` : "",
            typeof status === "number" ? `status=${status}` : "",
            typeof code === "string" ? `code=${code}` : "",
        ].filter(Boolean).join(" ");
        return extra ? `${error.message} (${extra})` : error.message;
    }
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

export function toPositiveInt(value: unknown, fallback: number): number {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) {
        return fallback;
    }
    return Math.floor(n);
}

export function toBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        const v = value.trim().toLowerCase();
        if (v === "true" || v === "1" || v === "yes") {
            return true;
        }
        if (v === "false" || v === "0" || v === "no") {
            return false;
        }
    }
    if (typeof value === "number") {
        return value !== 0;
    }
    return fallback;
}
