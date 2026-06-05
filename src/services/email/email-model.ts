export interface ItemModel {
    link: string;
    img: string;
    title: string;
    price: string;
    location?: string;
}

export interface ItemRowModel {
    items: ItemModel[];
}

export interface ChangedFavouriteModel {
    from: ItemModel;
    to: ItemModel;
}

export interface QueryResult {
    query: string;
    region: string;
    rows: ItemRowModel[];
}

export interface EmailModel {
    changedFavourites: ChangedFavouriteModel[];
    // Web homepage-only: favourites shown as a simple list (no from/to)
    favourites?: ItemRowModel[];
    queryResults: QueryResult[];
    generatedAt: string;

    // Optional top-nav link (used by web pages)
    navHref?: string;
    navText?: string;

    // Optional container width (used by web pages; email defaults to 500px)
    containerMaxWidth?: string;

    // Only set when rendering in the web UI.
    isWeb?: boolean;
}
