import { Express } from "express";
import bodyParser from "body-parser";
import { SearchQueryEntity } from "../../../services/db/search/search-query";
import { SearchQueryRepository } from "../../../services/db/repositories";
import { HardveraproFavouritesService } from "../../../services/favourites/hardverapro-favourites";
import { HardveraproSearchService } from "../../../services/search/hardverapro-search";
import { logger } from "../../../services/logging/logger";
import { AbstractWebController } from "../abstract-web-controller";
import cities from "../../../data/cities.json";
import counties from "../../../data/counties.json";
import { SettingsPageRenderer } from "./settings-page-renderer";
import { ResultsTransformer } from "../../email/email-transform";
import { EmailRenderer } from "../../email/email-renderer";
import { EmailSender } from "../../../services/email/email-sender";
import { indexById, RegionItem, RegionMap, toRegionList } from "../../../services/regions/region-utils";

const jsonParser = bodyParser.json();

type SearchQueryDoc = SearchQueryEntity & { _id?: string };

const CITY_LIST: RegionItem[] = toRegionList(cities as unknown as RegionMap);
const COUNTY_LIST: RegionItem[] = toRegionList(counties as unknown as RegionMap);

const CITY_BY_ID: Record<number, RegionItem> = indexById(CITY_LIST);
const COUNTY_BY_ID: Record<number, RegionItem> = indexById(COUNTY_LIST);

const settingsRenderer = new SettingsPageRenderer("./src/view/web/admin/templates/settings-template.hbs");

const emailRenderer = new EmailRenderer("./src/view/email/templates/mail-template.hbs");
const emailSender = new EmailSender(emailRenderer);

function escapeHtml(s: unknown): string {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatLocation(regionType?: "city" | "county" | "none", regionId?: number): string {
    if (regionType === "county" && Number.isFinite(regionId)) {
        const item = COUNTY_BY_ID[Number(regionId)];
        return `County: ${(item ? item.title : String(regionId))} (${String(regionId)})`;
    }

    if (regionType === "city" && Number.isFinite(regionId)) {
        const item = CITY_BY_ID[Number(regionId)];
        return `City: ${(item ? item.title : String(regionId))} (${String(regionId)})`;
    }

    return "All regions";
}

function formatCategory(category?: string): string {
    const c = String(category ?? "").trim();
    if (!c || c === "/") {
        return "All categories";
    }
    return c;
}


export class SettingsController extends AbstractWebController {

    constructor(
        private searchService: HardveraproSearchService,
        private favouritesService: HardveraproFavouritesService,
    ) {
        super();
    }

    public registerSelf(app: Express) {
        app.get("/regions/cities", (req, res) => {
            res.json(CITY_LIST);
        });

        app.get("/regions/counties", (req, res) => {
            res.json(COUNTY_LIST);
        });

        app.post("/queries", jsonParser, async (req, res) => {
            const query = (req.body?.query ?? "").toString().trim();
            let category = (req.body?.category ?? "").toString().trim();

            // Category rules:
            // - Empty or "/" means "all categories"
            // - Otherwise, must start with "/" and must not end with "/" (avoid double slashes in URL)
            if (category === "/") {
                category = "";
            }
            while (category.length > 1 && category.endsWith("/")) {
                category = category.slice(0, -1);
            }
            if (category && !category.startsWith("/")) {
                res.status(400).json({ error: "Category must start with '/' (or leave empty for all categories)." });
                return;
            }

            const regionTypeRaw = (req.body?.regionType ?? "").toString().trim();
            const regionIdRaw = req.body?.regionId;

            const regionType: ("city" | "county" | "none") | undefined = (regionTypeRaw === "city" || regionTypeRaw === "county" || regionTypeRaw === "none")
                ? regionTypeRaw
                : undefined;

            const regionId = (regionIdRaw === null || regionIdRaw === undefined || regionIdRaw === "")
                ? undefined
                : Number.parseInt(regionIdRaw.toString(), 10);

            if (!query) {
                res.status(400).json({ error: "'query' is required." });
                return;
            }

            if (regionType === "none") {
                if (regionId !== undefined) {
                    res.status(400).json({ error: "Invalid region selection." });
                    return;
                }
            } else if (regionType === "city" || regionType === "county") {
                if (!Number.isFinite(regionId)) {
                    res.status(400).json({ error: "Invalid region selection." });
                    return;
                }
            } else {
                // Backwards compatible: if not provided, accept and keep defaults
                if (regionId !== undefined) {
                    res.status(400).json({ error: "Invalid region selection." });
                    return;
                }
            }

            try {
                const resBody = await SearchQueryRepository
                    .getInstance()
                    .save(new SearchQueryEntity(query, category, regionType, regionId));

                res.json(resBody);
            } catch (e) {
                res.status(500).json({ error: "Failed to save query." });
            }
        });

        app.get("/queries", async (req, res) => {
            let queries = await this.getSearchQueries();

            res.json(queries);
        });

        app.get("/queries/table", async (req, res) => {
            const queries = await this.getSearchQueries();
            const rowsHtml = (queries || []).map((q: SearchQueryDoc) => {
                const id = q._id ?? "";
                const loc = formatLocation(q.regionType, q.regionId);
                const categoryLabel = formatCategory(q.category);
                return "<tr>" +
                    "<td>" + escapeHtml(q.query ?? "") + "</td>" +
                    "<td>" + escapeHtml(categoryLabel) + "</td>" +
                    "<td>" + escapeHtml(loc) + "</td>" +
                    "<td><code>" + escapeHtml(id) + "</code></td>" +
                    "<td class=\"actions\"><button data-del=\"" + escapeHtml(id) + "\">Delete</button></td>" +
                    "</tr>";
            }).join("");

            res.type("html").send(rowsHtml);
        });

        app.delete("/queries/:queryId", async (req, res) => {
            try {
                await SearchQueryRepository.getInstance().deleteId(req.params.queryId);
                res.send();
            } catch (e) {
                logger.error("Failed to delete query:", e);
                res.status(500).send();
            }
        });

        app.post("/settings/send-email", async (req, res) => {
            try {
                const searchQueries = await this.getSearchQueries();
                const searchResults = await this.searchService.searchForNewItems(searchQueries, { fresh: true });
                const favourites = await this.favouritesService.getDiffFavourites({ fresh: true });

                const notification = ResultsTransformer.transformResultToEmail(searchResults, favourites);
                if (!notification) {
                    res.json({ sent: false, message: "No new items or changed favourites to send." });
                    return;
                }

                await emailSender.sendNotification(notification);
                res.json({ sent: true });
            } catch (e) {
                logger.error("Failed to send email from settings:", e);
                res.status(500).json({ sent: false, error: "Failed to send email." });
            }
        });

        app.get("/settings", (req, res) => {
            res.type("html").send(this.renderSettingsPage());
        });
    }

    private renderSettingsPage(): string {
        return settingsRenderer.render({ navHref: "/", navText: "Home", containerMaxWidth: "980px" });
    }
    
}
