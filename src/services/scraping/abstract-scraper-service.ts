import axiosOriginal, { AxiosInstance } from "axios";
import axiosCookieJarSupport from "axios-cookiejar-support";
import tough from "tough-cookie";
import { JSDOM, ResourceLoader, VirtualConsole } from "jsdom";

import { scrapingConfig, favouritesConfig } from "../../config";
import { mapWithConcurrency, sleep } from "./async-utils";
import { with429Retry } from "./http-retry";
import { logger } from "../logging/logger";

export enum HeaderAcceptType {
    HTML = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    JSON = "application/json, text/javascript, */*; q=0.01"
}

export class BlockExternalScriptsResourceLoader extends ResourceLoader {

    public fetch(url: string, options: any) {
        const elementTag = options && options.element && options.element.tagName;
        const isScript = elementTag === "SCRIPT";
        if (isScript || /\.js(\?|#|$)/i.test(url)) {
            return null;
        }
        return super.fetch(url, options);
    }
}

/**
 * Small base class for services that fetch + parse HTML.
 * Centralizes retry/backoff and concurrency helpers.
 */
export abstract class AbstractScraperService {
    protected readonly sleep = sleep;
    protected readonly mapWithConcurrency = mapWithConcurrency;
    protected readonly with429Retry = with429Retry;

    protected static axios: AxiosInstance;

    protected static cookieJar = new tough.CookieJar();

    static {
        const axiosInstance = axiosOriginal;

        axiosInstance.interceptors.request.use(request => {
            logger.debug('[scraper] axios Starting Request', JSON.stringify(request, null, 2));
            logger.debug(`[scraper] axios Request Cookies: ${JSON.stringify(request.headers?.Cookie, null, 2) || "none"}`);
            logger.debug(`[scraper] axios Request headers: ${JSON.stringify(request.headers, null, 2) || "none"}`);
            return request
        }, error => {
            logger.error('[scraper] axios Request Error:', error);
            return Promise.reject(error);
        },);

        axiosInstance.interceptors.response.use(response => {
            logger.debug('[scraper] axios Response config:', JSON.stringify(response.config, null, 2));
            logger.debug(`[scraper] axios Response Cookies: ${JSON.stringify(response.headers?.['set-cookie'], null, 2) || "none"}`);
            logger.debug(`[scraper] axios Response headers: ${JSON.stringify(response.headers, null, 2) || "none"}`);
            logger.debug(`[scraper] axios Response status: ${response.status} ${response.statusText}`);
            return response
        }, error => {
            logger.error('[scraper] axios Response Error:', error);
            return Promise.reject(error);
        });

        AbstractScraperService.axios = axiosCookieJarSupport(axiosInstance);
    }

    /**
     * Helper method to generate request headers, including Accept, Accept-Language, and User-Agent.
     * @param acceptType - the value for the Accept header, defaults to HeaderAcceptType.HTML
     * @param additionalHeaders - any additional headers to include in the request
     * @returns an object containing the combined headers
     */
    protected getRequestHeaders(acceptType: HeaderAcceptType = HeaderAcceptType.HTML, additionalHeaders: Record<string, string> = {}): Record<string, string> {
        return {
            "Accept": acceptType,
            "Accept-Language": "hu-HU,hu;q=0.9,en;q=0.8",
            "User-Agent": scrapingConfig.searchUserAgent,
            ...additionalHeaders
        };
    }

    /**
     * Checks if the current session is valid by verifying the presence of specific cookies in the cookie jar.
     * @returns true if the session is considered valid, false otherwise
     */
    protected static isValidSession(): boolean {
        // A simple heuristic to check if the session is valid: we check if the cookie jar has any cookies for the target domain.
        // This is not a guarantee that the session is valid, but it's a reasonable check to avoid making requests with an empty cookie jar.
        const cookies = AbstractScraperService.cookieJar.getCookiesSync(favouritesConfig.favouritePageUrl);

        const mustHaveCookies = ["sid", "vid"];
        for (const cookieName of mustHaveCookies) {
            if (!cookies.some(cookie => cookie.key === cookieName)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Initializes the session by making a HEAD request to the base URL, which 
     * allows us to store any cookies set by the server before making actual requests. 
     * This can help with sites that require a session cookie or have anti-scraping measures. 
     * We catch and log any errors during initialization, but do not throw, 
     * as we want to allow the service to function even if the initial request fails (it may succeed on subsequent requests).
     */
    public async initializeSession(maxRetries: number): Promise<void> {
        if (AbstractScraperService.isValidSession()) {
            logger.info(`[${this.constructor.name}] session is already valid, skipping initialization`);
            return;
        }

        // Silence jsdom console noise (external scripts will be blocked anyway)
        const virtualConsole = new VirtualConsole();

        logger.info(`[${this.constructor.name}] session initialization triggered`);

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            await JSDOM.fromURL(
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
                .then((response) => {
                    logger.info(`[${this.constructor.name}] session initialization request successful, cookies stored: ${AbstractScraperService.cookieJar.getCookiesSync(favouritesConfig.favouritePageUrl).map(cookie => `${cookie.key}=${cookie.value}`).join("; ")}`);
                })
                .catch((error) => {
                    // Important: do NOT log the full axios error object (it contains cookies/headers).
                    logger.error(`[${this.constructor.name}] session initialization failed: ${error.message}`);
                    throw error; // re-raise the error to trigger retry logic in with429Retry
                });

            if (AbstractScraperService.isValidSession()) {
                logger.info(`[${this.constructor.name}] session is valid after attempt ${attempt}`);
                return;
            } else {
                logger.warn(`[${this.constructor.name}] session is still invalid after attempt ${attempt}, retrying...`);
            }

            await this.sleep(2000 * attempt); // Exponential backoff: wait longer between each attempt
        }

        logger.error(`[${this.constructor.name}] session initialization failed after ${maxRetries} attempts, giving up`);
        throw new Error(`Failed to initialize session after ${maxRetries} attempts`);
    }

    /**
     * Helper method to extract a specific cookie value from the cookie jar for a given URL.
     * @param name - the name of the cookie to retrieve
     * @param url - the URL for which to retrieve the cookie (defaults to "https://hardverapro.hu")
     * @returns the value of the cookie if found, or undefined if not found
     */
    protected static getCookieFromJar(name: string, url: string = "https://hardverapro.hu") {
        const cookies = AbstractScraperService.cookieJar.getCookiesSync(url);
        const cookie = cookies.find((c) => c.key === name);
        return cookie ? cookie.value : undefined;
    }

}
