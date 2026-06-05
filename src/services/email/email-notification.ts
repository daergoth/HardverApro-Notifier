import { ChangedFavouriteModel, ItemRowModel, QueryResult } from "./email-model";

export class EmailNotification {

    public generatedAt: string;
    public changedFavourites: ChangedFavouriteModel[] = [];
    // Web homepage-only
    public favourites?: ItemRowModel[];
    public queryResults: QueryResult[] = [];
    public isWeb?: boolean;
    public navHref?: string;
    public navText?: string;
    public containerMaxWidth?: string;

    constructor(
        public subject: string,
    ) {
        this.generatedAt = new Date().toISOString();
    }

    public withChangedFavourites(changedFavourites: ChangedFavouriteModel[]): EmailNotification {
        this.changedFavourites = changedFavourites;
        return this;
    }

    public withQueryResults(queryResults: QueryResult[]): EmailNotification {
        this.queryResults = queryResults;
        return this;
    }

    public withFavourites(favourites: ItemRowModel[]): EmailNotification {
        this.favourites = favourites;
        return this;
    }

    public asWeb(isWeb: boolean = true): EmailNotification {
        this.isWeb = isWeb;
        return this;
    }

    public withNav(navHref: string, navText: string): EmailNotification {
        this.navHref = navHref;
        this.navText = navText;
        return this;
    }

    public withContainerMaxWidth(containerMaxWidth: string): EmailNotification {
        this.containerMaxWidth = containerMaxWidth;
        return this;
    }
}
