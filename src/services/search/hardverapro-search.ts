import axios from "axios";
import { setTimeout } from 'timers/promises';
import { JSDOM } from "jsdom";
import { favouritesConfig, scrapingConfig, searchConfig } from "../../config";
import { ProductItemEntity } from "../db/product/product-item";
import { ProductRepository } from "../db/repositories";
import { logger } from "../logging/logger";
import { AbstractScraperService } from "../scraping/abstract-scraper-service";
import { htmlPageCache } from "../scraping/html-page-cache";
import { formatError, toPositiveInt } from "../utils/helpers";
import { SearchQuery } from "./search-query";
import { SearchResult } from "./search-result";

const countRegex = new RegExp(searchConfig.countRegex);

export class HardveraproSearchService extends AbstractScraperService {

    private buildSearchCacheKey(searchUrl: string, params: Record<string, unknown>): string {
        try {
            const url = new URL(searchUrl);

            // Stable ordering so keys match across runs.
            const keys = Object.keys(params || {}).sort();
            for (const k of keys) {
                const v = params[k];
                if (v === undefined || v === null || v === "") {
                    continue;
                }
                url.searchParams.set(k, String(v));
            }

            url.hash = "";
            return `search:${url.toString()}`;
        } catch {
            return `search:${searchUrl}`;
        }
    }

    private getRegionParams(searchQuery: SearchQuery): Record<string, number> {
        const regionId = searchQuery.regionId;
        const regionType = searchQuery.regionType;

        if (regionType === "none") {
            return {};
        }

        if (regionType === "city" && typeof regionId === "number") {
            return { stmid: regionId };
        }

        if (regionType === "county" && typeof regionId === "number") {
            return { stcid: regionId };
        }

        // Default: search all regions (omit stmid/stcid)
        return {};
    }

    /**
     * Searches multiple queries with limited concurrency.
     * Any failing query will be logged and skipped (returns partial results).
     */
    public async searchMany(
        searchQueries: SearchQuery[],
        concurrency: number = 1,
        options?: { fresh?: boolean },
    ): Promise<SearchResult[]> {
        logger.info(`[search] start queries=${(searchQueries || []).length} concurrency=${concurrency} fresh=${Boolean(options?.fresh)}`);
        const results = await this.mapWithConcurrency(searchQueries, concurrency, async (query) => {
            try {
                const result = await this.search(query, options);
                logger.info(`[search] completed query='${query?.query}' category='${query?.category}' count=${result.count} items=${result.items.length}, delaying for ${scrapingConfig?.searchDelayMs}ms...`);
                await setTimeout(scrapingConfig?.searchDelayMs);
                return result;
            } catch (error) {
                logger.error(`[search] failed query='${query?.query}' category='${query?.category}': ${formatError(error)}`);
                return null;
            }
        });

        return results.filter((x): x is SearchResult => x !== null);
    }

    public search(searchQuery: SearchQuery, options?: { fresh?: boolean }): Promise<SearchResult> {
        const queryText = searchQuery.query || "";
        let category = (searchQuery.category || "").toString().trim();
        if (category === "/") {
            category = "";
        }
        while (category.length > 1 && category.endsWith("/")) {
            category = category.slice(0, -1);
        }

        const searchUrl = searchConfig.baseUrl.replace("%category%", category);

        const params: Record<string, string | number> = {
            noiced: 1,
            selling: 1,
            stext: queryText,
            ...this.getRegionParams(searchQuery),
        };

        const cacheKey = this.buildSearchCacheKey(searchUrl, params);

        // Also build a canonical full URL used for fetching and for JSDOM so
        // that parsing uses the same query string as the network request.
        const fetchUrlObj = new URL(searchUrl);
        const sortedParamKeys = Object.keys(params || {}).sort();
        for (const k of sortedParamKeys) {
            const v = params[k];
            if (v === undefined || v === null || v === "") continue;
            fetchUrlObj.searchParams.set(k, String(v));
        }
        const fetchUrl = fetchUrlObj.toString();

        logger.info(`[search] fetch-url key='${this.buildSearchCacheKey(searchUrl, params)}' fetch_url='${fetchUrl}'`);

        const searchTtlMs = toPositiveInt(scrapingConfig?.searchPageCacheTtlMs, 5 * 60 * 1000);

        logger.info(`[search] fetch query='${queryText}' category='${category}' fresh=${Boolean(options?.fresh)} ttlMs=${searchTtlMs} search_url=${searchUrl}`);

        return htmlPageCache.getOrFetch(
            cacheKey,
            async () => {
                const response = await this.with429Retry(() => axios.get(
                    searchUrl,
                    {
                        headers: {
                            "Cookie": scrapingConfig.searchCookies,
                            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                            "Accept-Language": "hu-HU,hu;q=0.9,en;q=0.8",
                            "User-Agent": scrapingConfig?.searchUserAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
                        },
                        params,
                        maxRedirects: 0,
                        timeout: 15_000,
                    },
                ));
                logger.info(`[search] fetched query='${queryText}' category='${category}' status=${response.status} params=${JSON.stringify(response.config.params)} fetch_url=${response.request?.url}`);
                return String(response.data ?? "");
            },
            searchTtlMs,
            { refresh: Boolean(options?.fresh) },
        )
            .then((html) => {
                // Pass the full fetch URL (including params) to JSDOM so any
                // relative links or client-side checks see the exact request URL.
                const { document } = new JSDOM(html, { url: fetchUrl }).window;
                const countElementContent = document
                    .querySelector(searchConfig.countElementSelector)
                    ?.textContent;

                if (countElementContent) {
                    const titleElements = Array.from(document.querySelectorAll(searchConfig.itemsElementSelector));
                    logger.info(`[search] parsed query='${queryText}': items=${titleElements.length}`);
                    return { countElementContent, titleElements };
                } else {
                    logger.info(`[search] parsed query='${queryText}': missing count element`);
                    return { countElementContent: "0 találat erre: helykitöltő szöveg ", titleElements: [] };
                }
            })
            .then(({ countElementContent, titleElements }) => {
                return new SearchResult(
                    queryText,
                    category,
                    this.retrieveCount(countElementContent),
                    this.retrieveItems(titleElements),
                    searchQuery.regionType,
                    searchQuery.regionId,
                );
            })
            .catch((error) => {
                logger.error(`[search] error query='${searchQuery?.query}' category='${searchQuery?.category}': ${formatError(error)}`);
                throw error;
            });
    }

    public searchForNewItems(searchQueries: SearchQuery[], options?: { fresh?: boolean }): Promise<SearchResult[]> {
        logger.info(`[search] new-items start queries=${(searchQueries || []).length} fresh=${Boolean(options?.fresh)}`);
        return this.searchMany(searchQueries, scrapingConfig?.searchConcurrencyLimit, options)
            .then((searchResults: SearchResult[]) => {
                return Promise.all(searchResults.map((result) => {
                    logger.info(`[search] process query='${result.query}': items=${result.items.length}`);
                    return Promise.all(result.items.map((item) => {
                        if (item.link) {
                            return ProductRepository.getInstance().findByLink(item.link)
                                .then((dbResult) => {
                                    return {
                                        existing: dbResult,
                                        isNew: !(dbResult && item.equals(dbResult)),
                                    };
                                });
                        }
                        return { existing: null, isNew: false };
                    }))
                        .then(async (checks: Array<{ existing: ProductItemEntity | null, isNew: boolean }>) => {
                            const newEntries = result.items
                                .map((it, index) => ({ it, check: checks[index] }))
                                .filter((x) => Boolean(x.it) && Boolean(x.check) && x.check.isNew);

                            logger.info(`[search] diff query='${result.query}': newOrChanged=${newEntries.length}`);

                            // Try to reuse region from any existing DB record first
                            newEntries.forEach(({ it, check }) => {
                                if (!it.region && check?.existing?.region) {
                                    it.region = check.existing.region;
                                }
                            });

                            const newItems = newEntries.map((x) => x.it);
                            await this.enrichItemsWithRegionWithOptions(newItems, 1, options);

                            const items = newItems;
                            logger.info(`[search] after enrich query='${result.query}': newItems=${items.length}`);
                            return new SearchResult(result.query, result.category, result.count, items, result.regionType, result.regionId);
                        });
                }));
            })
            .then((searchResults: SearchResult[]) => {
                const saves: Array<Promise<unknown>> = [];
                searchResults.forEach((result) => {
                    result.items.forEach((item) => {
                        if (item) {
                            saves.push(ProductRepository.getInstance().save(item));
                        }
                    });
                });

                logger.info(`[search] saving new items count=${saves.length}`);
                return Promise.all(saves)
                    .then(() => {
                        logger.info(`[search] saved new items count=${saves.length}`);
                        return searchResults;
                    })
                    .catch((e) => {
                        logger.error(`[search] db save failed: ${formatError(e)}`);
                        throw e;
                    });
            })
            .then((searchResults: SearchResult[]) => {
                return searchResults.filter((result) => result.items.length > 0);
            });
    }

    /**
     * Homepage uses `searchMany()` (no product-page fetch), so items often have no region.
     * If we already have regions stored, hydrate them from DB for display.
     */
    public async hydrateRegionsFromDb(searchResults: SearchResult[], concurrency: number = 4): Promise<void> {
        const allItems: ProductItemEntity[] = (searchResults || [])
            .reduce((acc: ProductItemEntity[], r) => acc.concat(r?.items || []), [] as ProductItemEntity[]);

        const toHydrate = allItems.filter((it) => Boolean(it?.link) && (!it.region || it.region.trim() === ""));
        if (toHydrate.length <= 0) {
            return;
        }

        logger.info(`[search] hydrate regions from DB items=${toHydrate.length} concurrency=${concurrency}`);

        const repo = ProductRepository.getInstance();
        let hydrated = 0;
        await this.mapWithConcurrency(toHydrate, concurrency, async (item) => {
            try {
                const existing = await repo.findByLink(item.link);
                if (existing?.region) {
                    item.region = existing.region;
                    hydrated++;
                }
            } catch (e) {
                logger.error(`[search] hydrate region failed link='${item?.link}': ${formatError(e)}`);
            }
            return undefined;
        });

        logger.info(`[search] hydrate regions done hydrated=${hydrated}/${toHydrate.length}`);
    }

    private async enrichItemsWithRegion(items: ProductItemEntity[], concurrency: number = 1): Promise<void> {
        return this.enrichItemsWithRegionWithOptions(items, concurrency, undefined);
    }

    private async enrichItemsWithRegionWithOptions(
        items: ProductItemEntity[],
        concurrency: number,
        options?: { fresh?: boolean },
    ): Promise<void> {
        const toFetch = (items || []).filter((it) => Boolean(it?.link) && !it.region);
        if (toFetch.length <= 0) {
            return;
        }

        const selector = favouritesConfig.productPageRegionSelector;
        if (!selector) {
            logger.info("[search] region enrichment skipped: favouritesConfig.productPageRegionSelector not set");
            return;
        }

        const itemTtlMs = toPositiveInt(scrapingConfig?.itemPageCacheTtlMs, 60 * 60 * 1000);

        logger.info(`[search] region enrich start items=${toFetch.length} concurrency=${concurrency} fresh=${Boolean(options?.fresh)} ttlMs=${itemTtlMs}`);

        await this.mapWithConcurrency(toFetch, concurrency, async (item) => {
            try {
                const cacheKey = ProductItemEntity.normalizeLink(item.link);
                const html = await htmlPageCache.getOrFetch(cacheKey, async () => {
                    const response = await this.with429Retry(() =>
                        axios.get(item.link, { headers: { Accept: "text/html" }, timeout: 15_000 }),
                    );
                    return String(response.data ?? "");
                }, itemTtlMs, { refresh: Boolean(options?.fresh) });

                const { document } = new JSDOM(html, { url: item.link }).window;
                const raw = document.querySelector(selector)?.textContent || "";
                const region = ProductItemEntity.normalizeText(raw);
                if (region) {
                    item.region = region;
                }
            } catch (e) {
                logger.error(`[search] region enrich failed link='${item?.link}': ${formatError(e)}`);
            }
            return undefined;
        });

        logger.info(`[search] region enrich done items=${toFetch.length}`);
    }

    private retrieveCount(elementContent: string): number {
        const match = countRegex.exec(elementContent);
        const count = match?.groups?.count;
        if (!count) {
            return 0;
        }
        return Number.parseInt(count, 10);
    }

    private retrieveItems(itemElements: Element[]): ProductItemEntity[] {
        return itemElements
            .filter((element: Element) => {
                const ribbonElement = element.querySelector(searchConfig.itemsPRSelector);
                return !(ribbonElement && ribbonElement.textContent.includes("PR"));
            })
            .map((element: Element) => {
                const titleElement = element.querySelector(searchConfig.itemsTitleSelector);
                const imageElement = element.querySelector(searchConfig.itemsImageSelector);
                const priceElement = element.querySelector(searchConfig.itemsPriceSelector);

                const imageSrcAttr = imageElement?.getAttribute("src") || "";
                const imageLink: string = imageSrcAttr.startsWith("//")
                    ? `${searchConfig.imageBaseUrl}${imageSrcAttr}`
                    : imageSrcAttr;

                const title: string = titleElement?.textContent || "";
                const hrefAttr = titleElement?.getAttribute("href") || "";
                const link: string = ProductItemEntity.normalizeLink(hrefAttr);
                const price: string = priceElement?.textContent || "";

                const regionSelector = searchConfig.itemsRegionSelector;
                const regionRaw = regionSelector ? (element.querySelector(regionSelector)?.textContent || "") : "";
                const region = ProductItemEntity.normalizeText(regionRaw);

                return new ProductItemEntity(imageLink, title, link, price, region || undefined);
            });
    }
}
