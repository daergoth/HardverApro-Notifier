import { EventEmitter } from "events";
import { logger } from "../services/logging/logger";
import { SearchQueryEntity } from "../services/db/search/search-query";
import { SearchQueryRepository } from "../services/db/repositories";
import { HardveraproSearchService } from "../services/search/hardverapro-search";
import { HardveraproFavouritesService } from "../services/favourites/hardverapro-favourites";

const searchService = new HardveraproSearchService();
const favouritesService = new HardveraproFavouritesService();

export abstract class AbstractSearchResultController {

    public constructor() {
        searchService.initializeSession(3)
            .catch((err) => {
                logger.error(`[${this.constructor.name}] Failed to initialize search service session: ${err}`);
                throw err; // re-throw to prevent proceeding to favourites initialization if search initialization fails
            })
            .then(() => {
                logger.info(`[${this.constructor.name}] Search service session initialized successfully`);
            })
            .then(() => {
                return favouritesService.initializeSession(3);
            })
            .catch((err) => {
                logger.error(`[${this.constructor.name}] Failed to initialize favourites service session: ${err}`);
                throw err; // re-throw to prevent proceeding if favourites initialization fails
            })
            .then(() => {
                logger.info(`[${this.constructor.name}] Favourites service session initialized successfully`);
            });
    }

    public renderView(): EventEmitter {
        return this.doRenderView(searchService, favouritesService);
    }

    protected abstract doRenderView(searchService: HardveraproSearchService, favouritesService: HardveraproFavouritesService): EventEmitter;
}
