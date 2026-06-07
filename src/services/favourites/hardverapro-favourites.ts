import FormData from "form-data";
import { JSDOM, VirtualConsole } from "jsdom";
import { favouritesConfig, scrapingConfig } from "../../config";
import { ProductItemEntity } from "../db/product/product-item";
import { ProductRepository } from "../db/repositories";
import { logger } from "../logging/logger";
import { AbstractScraperService, HeaderAcceptType, BlockExternalScriptsResourceLoader } from "../scraping/abstract-scraper-service";
import { htmlPageCache } from "../scraping/html-page-cache";
import { formatError, toPositiveInt } from "../utils/helpers";
import { FavouriteResult } from "./favourite-result";



export class HardveraproFavouritesService extends AbstractScraperService {

    public async getFavourites(options?: { fresh?: boolean }): Promise<FavouriteResult[]> {
        try {
            logger.info(`[favs] start fresh=${Boolean(options?.fresh)}`);
            await this.authenticate();

            // Fetch main page with favourites list
            const response = await this.with429Retry(() => AbstractScraperService.axios.get(
                favouritesConfig.favouritePageUrl,
                {
                    jar: AbstractScraperService.cookieJar,
                    withCredentials: true,
                    headers: this.getRequestHeaders(),
                    timeout: 15_000,
                },
            ));

            const { document } = new JSDOM(response.data, { url: favouritesConfig.favouritePageUrl }).window;
            const favouriteElements = Array.from(document.querySelectorAll(favouritesConfig.favouriteListSelector));

            logger.info(`[favs] favourites list elements=${favouriteElements.length}`);

            // Extract product links from favourites list
            const productLinks = favouriteElements
                .map((elem) => elem.querySelector(favouritesConfig.favouriteLinkSelector)?.getAttribute("href") ?? null)
                .filter((link): link is string => link !== null)
                .map((link) => this.normalizeUrl(link));

            logger.info(`[favs] product links=${productLinks.length}`);

            // Fetch each product page to get detailed info
            await this.authenticate();

            const itemTtlMs = toPositiveInt(scrapingConfig?.itemPageCacheTtlMs, 60 * 60 * 1000);
            logger.info(`[favs] fetch product pages count=${productLinks.length} fresh=${Boolean(options?.fresh)} ttlMs=${itemTtlMs}`);
            const favouriteItems = await Promise.all(productLinks.map(async (link, index) => {
                await this.sleep(index * 500); // 0.5 second delay between requests

                const cacheKey = ProductItemEntity.normalizeLink(link);
                const html = await htmlPageCache.getOrFetch(cacheKey, async () => {
                    const productResponse = await this.with429Retry(() => AbstractScraperService.axios.get(link,
                        {
                            jar: AbstractScraperService.cookieJar,
                            withCredentials: true,
                            headers: this.getRequestHeaders(),
                            timeout: 15_000,
                        },
                    ));
                    return String(productResponse.data ?? "");
                }, itemTtlMs, { refresh: Boolean(options?.fresh) });

                // JS is disabled here (we're parsing HTML only)
                const { document: productDocument } = new JSDOM(html, { url: link }).window;
                const imageSrc = productDocument.querySelector(favouritesConfig.productPageImageSelector)?.getAttribute("src") || "";
                const imageUrl = this.normalizeImageUrl(imageSrc);
                const title = productDocument.querySelector(favouritesConfig.productPageTitleSelector)?.textContent?.trim() || "";
                const price = productDocument.querySelector(favouritesConfig.productPagePriceSelector)?.textContent?.trim() || "";
                const regionSelector = favouritesConfig.productPageRegionSelector;
                const region = regionSelector
                    ? (productDocument.querySelector(regionSelector)?.textContent?.trim() || "")
                    : "";
                return new ProductItemEntity(imageUrl, title, link, price, region);
            }));

            logger.info(`[favs] parsed favourites items=${favouriteItems.length}`);

            // Get previous state from DB and return both previous and current state
            const repo = ProductRepository.getInstance();
            let changedCount = 0;
            let savedCount = 0;
            const favouriteStates = await Promise.all(favouriteItems.map(async (item) => {
                try {
                    const dbResult = await repo.findByLink(item.link);

                    // Region can be present in DB even if current scrape misses it (selector drift, transient HTML).
                    // We want the UI/email to show region whenever we already know it.
                    if ((!item.region || item.region.trim() === "") && dbResult?.region) {
                        item.region = dbResult.region;
                    }

                    if (!dbResult || !item.equals(dbResult)) {
                        changedCount++;
                        // New or changed favourite, update DB
                        await repo.save(item);
                        savedCount++;
                        return { oldItem: dbResult, newItem: item };
                    }

                    return { oldItem: dbResult, newItem: item };
                } catch (error) {
                    logger.error(`[favs] failed to process item link='${item?.link}': ${formatError(error)}`);
                    return undefined;
                }
            }));

            logger.info(`[favs] compare done changed=${changedCount} saved=${savedCount}`);

            // Map to FavouriteResult objects
            return favouriteStates
                .filter((s): s is { oldItem: ProductItemEntity | null, newItem: ProductItemEntity } => Boolean(s))
                .map((state) => new FavouriteResult(state.oldItem, state.newItem));
        } catch (error) {
            logger.error(`[favs] failed to retrieve favourites: ${formatError(error)}`);
            return [];
        }
    }

    public getDiffFavourites(options?: { fresh?: boolean }): Promise<FavouriteResult[]> {
        return this.getFavourites(options)
            .then((favourites) => {
                // Filter only changed favourites
                return favourites.filter((fav) => !fav.oldItem || !fav.oldItem.equals(fav.newItem));
            });
    }

    private authenticate(): Promise<void> {
        // Silence jsdom console noise (external scripts will be blocked anyway)
        const virtualConsole = new VirtualConsole();

        const buildLoginForm = (fidentifier: string): FormData => {
            const form = new FormData();
            form.append("all", "1");
            form.append("email", favouritesConfig.username);
            form.append("fidentifier", fidentifier);
            form.append("leave_others", "1");
            form.append("no_ip_check", "1");
            form.append("pass", favouritesConfig.password);
            form.append("stay", "1");
            return form;
        };

        return JSDOM.fromURL(
            favouritesConfig.baseUrl,
            {
                cookieJar: AbstractScraperService.cookieJar,
                // Allow inline script execution (if the login page relies on it),
                // but block external scripts (ads/CMP/etc) that crash on Node 10.
                resources: new BlockExternalScriptsResourceLoader(),
                runScripts: "dangerously",
                virtualConsole,
                pretendToBeVisual: false,
                userAgent: scrapingConfig.searchUserAgent,
            },
        )
            .then((baseDom) => {
                const { document } = baseDom.window;
                const fidentifier = document
                    .querySelector(favouritesConfig.loginIdentifierSelector)
                    ?.getAttribute("value");

                if (!fidentifier) {
                    throw new Error("Missing login fidentifier");
                }

                return fidentifier;
            })
            .then((fidentifier) => {
                // Build a fresh FormData per attempt, because retries would otherwise reuse a consumed stream.
                return this.with429Retry(() => {
                    const form = buildLoginForm(fidentifier);
                    return AbstractScraperService.axios({
                        data: form,
                        headers: this.getRequestHeaders(HeaderAcceptType.JSON, form.getHeaders()),
                        jar: AbstractScraperService.cookieJar,
                        method: "post",
                        url: favouritesConfig.authenticationUrl,
                        withCredentials: true,
                        timeout: 15_000,
                    });
                }, 2);
            })
            .then((authDom) => {
                if (authDom?.data?.formError) {
                    throw new Error(String(authDom.data.formError));
                }
                logger.info(`[favs] authentication successful`);
            })
            .catch((error) => {
                // Important: do NOT log the full axios error object (it contains cookies/headers).
                logger.error(`[favs] authentication failed: ${formatError(error)}`);
                throw error;
            });
    }

    // private getLastSetCookie(cookieName: string, resp: AxiosResponse): string {
    //     const cookiesList = resp.headers["set-cookie"]
    //         .filter((cookie: string) => cookie.startsWith(`${cookieName}=`));
    //     const resultCookie = cookiesList[cookiesList.length - 1];

    //     return resultCookie ? resultCookie.split(";")[0].split("=")[1] : undefined;
    // }

    private normalizeUrl(url: string): string {
        const trimmed = (url || "").trim();
        if (!trimmed) {
            return "";
        }
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            return trimmed;
        }
        if (trimmed.startsWith("//")) {
            return `https:${trimmed}`;
        }
        if (trimmed.startsWith("/")) {
            return `https://hardverapro.hu${trimmed}`;
        }
        return trimmed;
    }

    private normalizeImageUrl(src: string): string {
        const normalized = this.normalizeUrl(src);
        if (!normalized) {
            return "";
        }
        // Keep config behaviour if it uses a prefix like "https:".
        if (favouritesConfig.imageBaseUrl && normalized.startsWith("/")) {
            return `${favouritesConfig.imageBaseUrl}${normalized}`;
        }
        return normalized;
    }

}
