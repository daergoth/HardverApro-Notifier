import { EventEmitter } from "events";
import { SearchQueryEntity } from "../services/db/search/search-query";
import { SearchQueryRepository } from "../services/db/repositories";
import { HardveraproSearchService } from "../services/search/hardverapro-search";
import { HardveraproFavouritesService } from "../services/favourites/hardverapro-favourites";

const searchService = new HardveraproSearchService();
const favouritesService = new HardveraproFavouritesService();

export abstract class AbstractSearchResultController {

    public renderView(): EventEmitter {
        return this.doRenderView(searchService, favouritesService);
    }

    protected abstract doRenderView(searchService: HardveraproSearchService, favouritesService: HardveraproFavouritesService): EventEmitter;
}
