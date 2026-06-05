import { Express } from "express";
import { SearchResult } from "../../../services/search/search-result";
import { HardveraproSearchService } from "../../../services/search/hardverapro-search";
import { HardveraproFavouritesService } from "../../../services/favourites/hardverapro-favourites";
import { logger } from "../../../services/logging/logger";
import { ResultsTransformer } from "../../email/email-transform";
import { AbstractWebController } from "../abstract-web-controller";
import { HomeRenderer } from "./home-renderer";
import { scrapingConfig } from "../../../config";

const homeRenderer = new HomeRenderer("./src/view/web/home/templates/home-template.hbs");

export class HomeController extends AbstractWebController {

    constructor(
        public searchService: HardveraproSearchService,
        public favouritesService: HardveraproFavouritesService
    ) {
        super();
    }

    public registerSelf(app: Express) {
        app.post("/refresh-caches", async (req, res) => {
            try {
                logger.info("[web] refresh-caches requested");
                const searchQueries = await this.getSearchQueries();
                await this.searchService.searchMany(searchQueries, scrapingConfig?.searchConcurrencyLimit, { fresh: true });
                await this.favouritesService.getFavourites({ fresh: true });
                logger.info("[web] refresh-caches completed");
                res.redirect(303, "/");
            } catch (error) {
                logger.error("[web] refresh-caches failed:", error);
                res.status(500).send("Failed to refresh caches.");
            }
        });

        app.get("/", async (req, res) => {
            try {
                const searchQueries = await this.getSearchQueries();
                const searchResults: SearchResult[] = await this.searchService.searchMany(searchQueries, scrapingConfig?.searchConcurrencyLimit);
                await this.searchService.hydrateRegionsFromDb(searchResults, 4);
                const favourites = await this.favouritesService.getFavourites();
                const notification = ResultsTransformer.transformResultToWeb(searchResults, favourites);

                res.send(homeRenderer.render(notification));
            } catch (error) {
                logger.error("Failed to render homepage:", error);
                res.status(500).send("Failed to render homepage.");
            }
        });
    }

}