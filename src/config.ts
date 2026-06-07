import Ajv from "ajv";
import addFormats from "ajv-formats";
import rawConfig from "./config.json";

export type SearchQueryConfig = {
    query: string;
    category?: string;
    regionType?: "city" | "county" | "none";
    regionId?: number;
};

export type SearchConfig = {
    baseUrl: string;
    imageBaseUrl: string;
    countRegex: string;
    countElementSelector: string;
    itemsElementSelector: string;
    itemsImageSelector: string;
    itemsTitleSelector: string;
    itemsPriceSelector: string;
    itemsPRSelector: string;
    itemsRegionSelector?: string;
};

export type FavouritesConfig = {
    baseUrl: string;
    imageBaseUrl: string;
    authenticationUrl: string;
    username: string;
    password: string;
    loginIdentifierSelector: string;
    favouritePageUrl: string;
    favouriteListSelector: string;
    favouriteLinkSelector: string;
    productPageImageSelector: string;
    productPageTitleSelector: string;
    productPagePriceSelector: string;
    productPageRegionSelector?: string;
};

export type EmailConfig = {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
    to: string[];
};

export type LocaleConfig = {
    locale: string;
};

export type ScrapingConfig = {
    htmlCacheTtlMs?: number;
    searchPageCacheTtlMs?: number;
    itemPageCacheTtlMs?: number;
    searchConcurrencyLimit?: number;
    searchDelayMs: number;
    searchUserAgent: string;
    htmlCachePersistInDb?: boolean;
    htmlCacheCollectionName?: string;
};

export type MongoConfig = {
    host: string;
    port: number;
    dbName: string;
};

export type AppConfig = {
    searchQueries: SearchQueryConfig[];
    searchConfig: SearchConfig;
    favouritesConfig: FavouritesConfig;
    emailConfig: EmailConfig;
    localeConfig: LocaleConfig;
    scrapingConfig: ScrapingConfig;
    mongoConfig: MongoConfig;
};

const schema = {
    type: "object",
    additionalProperties: false,
    required: ["searchQueries", "searchConfig", "favouritesConfig", "emailConfig", "mongoConfig"],
    properties: {
        searchQueries: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["query"],
                properties: {
                    query: { type: "string", minLength: 1 },
                    category: { type: "string" },
                    regionType: { type: "string", enum: ["city", "county", "none"] },
                    regionId: { type: "number" },
                },
            },
        },
        searchConfig: {
            type: "object",
            additionalProperties: false,
            required: [
                "baseUrl",
                "imageBaseUrl",
                "countRegex",
                "countElementSelector",
                "itemsElementSelector",
                "itemsImageSelector",
                "itemsTitleSelector",
                "itemsPriceSelector",
                "itemsPRSelector",
            ],
            properties: {
                baseUrl: { type: "string", minLength: 1 },
                imageBaseUrl: { type: "string", minLength: 1 },
                countRegex: { type: "string", minLength: 1 },
                countElementSelector: { type: "string", minLength: 1 },
                itemsElementSelector: { type: "string", minLength: 1 },
                itemsImageSelector: { type: "string", minLength: 1 },
                itemsTitleSelector: { type: "string", minLength: 1 },
                itemsPriceSelector: { type: "string", minLength: 1 },
                itemsPRSelector: { type: "string", minLength: 1 },
                itemsRegionSelector: { type: "string" },
            },
        },
        favouritesConfig: {
            type: "object",
            additionalProperties: false,
            required: [
                "baseUrl",
                "imageBaseUrl",
                "authenticationUrl",
                "username",
                "password",
                "loginIdentifierSelector",
                "favouritePageUrl",
                "favouriteListSelector",
                "favouriteLinkSelector",
                "productPageImageSelector",
                "productPageTitleSelector",
                "productPagePriceSelector",
            ],
            properties: {
                baseUrl: { type: "string", minLength: 1 },
                imageBaseUrl: { type: "string", minLength: 1 },
                authenticationUrl: { type: "string", minLength: 1 },
                username: { type: "string", minLength: 1 },
                password: { type: "string", minLength: 1 },
                loginIdentifierSelector: { type: "string", minLength: 1 },
                favouritePageUrl: { type: "string", minLength: 1 },
                favouriteListSelector: { type: "string", minLength: 1 },
                favouriteLinkSelector: { type: "string", minLength: 1 },
                productPageImageSelector: { type: "string", minLength: 1 },
                productPageTitleSelector: { type: "string", minLength: 1 },
                productPagePriceSelector: { type: "string", minLength: 1 },
                productPageRegionSelector: { type: "string" },
            },
        },
        emailConfig: {
            type: "object",
            additionalProperties: false,
            required: ["host", "port", "user", "pass", "from", "to"],
            properties: {
                host: { type: "string", minLength: 1 },
                port: { type: "number" },
                user: { type: "string", minLength: 1 },
                pass: { type: "string", minLength: 1 },
                from: { type: "string", minLength: 1 },
                to: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 },
            },
        },
        localeConfig: {
            type: "object",
            additionalProperties: false,
            required: ["locale"],
            properties: {
                locale: { type: "string", minLength: 1 },
            },
        },
        scrapingConfig: {
            type: "object",
            additionalProperties: false,
            required: ["searchDelayMs", "searchUserAgent"],
            properties: {
                htmlCacheTtlMs: { type: "number" },
                searchPageCacheTtlMs: { type: "number" },
                itemPageCacheTtlMs: { type: "number" },
                searchConcurrencyLimit: { type: "number" },
                searchDelayMs: { type: "number" },
                searchUserAgent: { type: "string" },
                htmlCachePersistInDb: { type: "boolean" },
                htmlCacheCollectionName: { type: "string" },
            },
        },
        mongoConfig: {
            type: "object",
            additionalProperties: false,
            required: ["host", "port", "dbName"],
            properties: {
                host: { type: "string", minLength: 1 },
                port: { type: "number" },
                dbName: { type: "string", minLength: 1 },
            },
        },
    },
} as const;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validate = ajv.compile(schema);
const config = rawConfig as unknown;
if (!validate(config)) {
    const issues = (validate.errors || []).map((err) => `${err.instancePath || "config"} ${err.message}`).join("; ");
    throw new Error(`Invalid config.json: ${issues}`);
}

const typedConfig = config as AppConfig;

export const searchQueries = typedConfig.searchQueries;
export const searchConfig = typedConfig.searchConfig;
export const favouritesConfig = typedConfig.favouritesConfig;
export const emailConfig = typedConfig.emailConfig;
export const localeConfig = typedConfig.localeConfig;
export const scrapingConfig = typedConfig.scrapingConfig;
export const mongoConfig = typedConfig.mongoConfig;
