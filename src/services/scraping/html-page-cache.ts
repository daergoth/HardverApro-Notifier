import { scrapingConfig } from "../../config";
import { Database } from "../db/db";
import { logger } from "../logging/logger";
import { formatError, toBoolean, toPositiveInt } from "../utils/helpers";

type CacheEntry = {
    expiresAt: number;
    value?: string;
    inFlight?: Promise<string>;
};

type DbCacheDoc = {
    _id: string;
    value: string;
    expiresAt: Date | number;
    createdAt: Date | number;
    updatedAt: Date | number;
};

/**
 * Small in-memory HTML cache with TTL.
 *
 * - Dedupes concurrent requests for the same key (via inFlight promise).
 * - Caches only successful fetches.
 * - Lazy eviction on access.
 */
export class HtmlPageCache {
    private readonly entries = new Map<string, CacheEntry>();
    private readonly persistInDb: boolean;
    private readonly collectionName: string;
    private indexEnsured?: Promise<void>;

    constructor(
        private readonly defaultTtlMs: number = 5 * 60 * 1000,
        options?: { persistInDb?: boolean; collectionName?: string },
    ) {
        this.persistInDb = Boolean(options?.persistInDb);
        this.collectionName = options?.collectionName || "html_page_cache";
    }

    public async getOrFetch(
        key: string,
        fetcher: () => Promise<string>,
        ttlMs: number = this.defaultTtlMs,
        options?: { refresh?: boolean; bypassCache?: boolean },
    ): Promise<string> {
        const now = Date.now();
        const existing = this.entries.get(key);
        const forceRefresh = Boolean(options?.refresh || options?.bypassCache);

        const shortKey = this.shortenKey(key);

        // Normal path: return cached value if still valid.
        if (!forceRefresh && existing && existing.expiresAt > now) {
            if (existing.value !== undefined) {
                logger.info(`[cache] hit (memory) key=${shortKey}`);
                return existing.value;
            }
            if (existing.inFlight) {
                logger.info(`[cache] hit (in-flight) key=${shortKey}`);
                return existing.inFlight;
            }
        }

        // Refresh path: if a refresh is already in-flight, await it.
        if (forceRefresh && existing && existing.expiresAt > now && existing.inFlight) {
            logger.info(`[cache] refresh requested; awaiting in-flight key=${shortKey}`);
            return existing.inFlight;
        }

        // Clear expired entry.
        if (existing && existing.expiresAt <= now) {
            logger.info(`[cache] expired (memory) evicted key=${shortKey}`);
            this.entries.delete(key);
        }

        // If enabled, check persisted cache before doing a network fetch.
        // Skip DB read when forcing refresh.
        if (!forceRefresh && this.persistInDb) {
            await this.ensureDbIndexes();
            const fromDb = await this.tryGetFromDb(key, now);
            if (fromDb !== null) {
                logger.info(`[cache] hit (db) key=${shortKey}`);
                this.entries.set(key, {
                    expiresAt: fromDb.expiresAt,
                    value: fromDb.value,
                });
                return fromDb.value;
            }
        }

        // Re-check after DB work (avoid duplicate fetch if another call populated it).
        if (!forceRefresh) {
            const existingAfterDb = this.entries.get(key);
            if (existingAfterDb && existingAfterDb.expiresAt > now) {
                if (existingAfterDb.value !== undefined) {
                    logger.info(`[cache] hit (memory-after-db) key=${shortKey}`);
                    return existingAfterDb.value;
                }
                if (existingAfterDb.inFlight) {
                    logger.info(`[cache] hit (in-flight-after-db) key=${shortKey}`);
                    return existingAfterDb.inFlight;
                }
            }
        }

        logger.info(`[cache] miss key=${shortKey} refresh=${forceRefresh} ttlMs=${Math.max(0, ttlMs)}`);

        const inFlight = (async () => {
            try {
                const html = await fetcher();

                const expiresAt = Date.now() + Math.max(0, ttlMs);
                this.entries.set(key, { expiresAt, value: html });

                if (this.persistInDb) {
                    await this.ensureDbIndexes();
                    await this.trySaveToDb(key, html, expiresAt);
                    logger.info(`[cache] saved (db) key=${shortKey}`);
                }

                logger.info(`[cache] saved (memory) key=${shortKey}`);
                return html;
            } catch (e) {
                // Don't cache failures.
                logger.error(`[cache] fetch failed key=${shortKey}: ${formatError(e)}`);
                this.entries.delete(key);
                throw e;
            }
        })();

        this.entries.set(key, {
            expiresAt: now + Math.max(0, ttlMs),
            inFlight,
        });

        // Opportunistic cleanup to avoid unbounded growth.
        if (this.entries.size > 500) {
            const before = this.entries.size;
            this.evictExpired();
            const after = this.entries.size;
            if (after < before) {
                logger.info(`[cache] evicted expired entries count=${before - after}`);
            }
        }

        return inFlight;
    }

    public clear(): void {
        this.entries.clear();
    }

    private evictExpired(): void {
        const now = Date.now();
        for (const [key, entry] of this.entries.entries()) {
            if (entry.expiresAt <= now && !entry.inFlight) {
                this.entries.delete(key);
            }
        }
    }

    private async tryGetFromDb(key: string, now: number): Promise<{ value: string; expiresAt: number } | null> {
        try {
            const collection = await Database.getInstance().getCollection<DbCacheDoc>(this.collectionName);
            const doc = await collection.findOne({ _id: key }) as DbCacheDoc | null;
            if (!doc) {
                return null;
            }

            const expiresAtMs = this.toEpochMs(doc.expiresAt);
            if (expiresAtMs !== null && expiresAtMs > now && typeof doc.value === "string") {
                // If this is an old numeric doc, opportunistically upgrade it to a Date so TTL index can clean it up.
                if (typeof doc.expiresAt === "number") {
                    await collection.updateOne(
                        { _id: key },
                        { $set: { expiresAt: new Date(expiresAtMs), updatedAt: new Date() } },
                    );
                }

                return { value: doc.value, expiresAt: expiresAtMs };
            }

            // Best-effort cleanup of expired/invalid docs.
            await collection.deleteOne({ _id: key });
            return null;
        } catch (e) {
            logger.error(`[cache] db read failed key=${this.shortenKey(key)}: ${formatError(e)}`);
            // If DB is unavailable, behave like in-memory cache only.
            return null;
        }
    }

    private async trySaveToDb(key: string, value: string, expiresAt: number): Promise<void> {
        try {
            const collection = await Database.getInstance().getCollection<DbCacheDoc>(this.collectionName);
            const now = new Date();
            await collection.updateOne(
                { _id: key },
                {
                    $set: { value, expiresAt: new Date(expiresAt), updatedAt: now },
                    $setOnInsert: { createdAt: now },
                },
                { upsert: true },
            );
        } catch (e) {
            logger.error(`[cache] db save failed key=${this.shortenKey(key)}: ${formatError(e)}`);
            // Ignore persistence errors; cache still works in-memory.
        }
    }

    private ensureDbIndexes(): Promise<void> {
        if (this.indexEnsured) {
            return this.indexEnsured;
        }

        this.indexEnsured = (async () => {
            try {
                const collection = await Database.getInstance().getCollection<DbCacheDoc>(this.collectionName);
                // TTL index: MongoDB will delete documents once expiresAt < now.
                await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
                logger.info(`[cache] ensured TTL index on ${this.collectionName}.expiresAt`);
            } catch (e) {
                logger.error(`[cache] failed to ensure TTL index on ${this.collectionName}.expiresAt: ${formatError(e)}`);
                // Ignore index creation errors (e.g., permissions). Cache still functions.
            }
        })();

        return this.indexEnsured;
    }

    private toEpochMs(value: unknown): number | null {
        if (value instanceof Date) {
            const ms = value.getTime();
            return Number.isFinite(ms) ? ms : null;
        }
        if (typeof value === "number") {
            return Number.isFinite(value) ? value : null;
        }
        if (typeof value === "string") {
            const ms = Date.parse(value);
            return Number.isFinite(ms) ? ms : null;
        }
        return null;
    }

    private shortenKey(key: string): string {
        const s = String(key ?? "");
        if (s.length <= 160) {
            return s;
        }
        return `${s.slice(0, 120)}...${s.slice(-30)}`;
    }
}

// One shared cache instance per process so search + favourites can reuse pages.
// TTL is configured in src/config.json under scrapingConfig.htmlCacheTtlMs.
export const htmlPageCache = new HtmlPageCache(
    toPositiveInt(scrapingConfig?.htmlCacheTtlMs, 5 * 60 * 1000),
    {
        persistInDb: toBoolean(scrapingConfig?.htmlCachePersistInDb, false),
        collectionName: String(scrapingConfig?.htmlCacheCollectionName || "html_page_cache"),
    },
);
