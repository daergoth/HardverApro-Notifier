import { Express } from "express";
import { SearchQueryRepository } from "../../services/db/repositories";
import { SearchQueryEntity } from "../../services/db/search/search-query";

export abstract class AbstractWebController {

    public abstract registerSelf(app: Express): void;

    protected getSearchQueries(): Promise<SearchQueryEntity[]> {
        return SearchQueryRepository.getInstance().findAll();
    }
}