import { FavouriteResult } from "../../services/favourites/favourite-result";
import { ProductItemEntity } from "../../services/db/product/product-item";
import { ChangedFavouriteModel, ItemRowModel, QueryResult } from "../../services/email/email-model";
import { EmailNotification } from "../../services/email/email-notification";
import { SearchResult } from "../../services/search/search-result";
import cities from "../../data/cities.json";
import counties from "../../data/counties.json";
import { indexById, RegionMap, toRegionList } from "../../services/regions/region-utils";

const cityById = indexById(toRegionList(cities as unknown as RegionMap));
const countyById = indexById(toRegionList(counties as unknown as RegionMap));

function formatRegion(result: SearchResult): string {
    const type = result.regionType;
    const id = result.regionId;

    if (type === "city" && typeof id === "number") {
        const city = cityById[id];
        return `City: ${city ? city.title : id}`;
    }

    if (type === "county" && typeof id === "number") {
        const county = countyById[id];
        return `County: ${county ? county.title : id}`;
    }

    return "All regions";
}

const mapChunkToModel = (chunk: ProductItemEntity[]): ItemRowModel => {
    const mappedItems = chunk.map((item) => {
        return {
            img: item.image,
            link: item.link,
            price: item.price,
            title: item.title,
            location: item.region,
        };
    });

    return {
        items: mappedItems,
    };
};

function chunkIntoRows(items: ProductItemEntity[], rowSize: number = 4): ItemRowModel[] {
    if (!items || items.length <= 0) {
        return [];
    }

    const size = Math.max(1, Math.floor(rowSize));
    return new Array(Math.ceil(items.length / size))
        .fill(0)
        .map((_, i) => items.slice(i * size, i * size + size))
        .map(mapChunkToModel);
}

function toQueryResults(searchResults: SearchResult[], rowSize: number = 4): QueryResult[] {
    return (searchResults || [])
        .sort((a, b) => b.items.length - a.items.length)
        .map((result) => {
            return {
                query: result.query,
                region: formatRegion(result),
                rows: chunkIntoRows(result.items, rowSize),
            };
        });
}

export const ResultsTransformer = {

    transformResultToEmail(searchResults: SearchResult[], favourites: FavouriteResult[]): EmailNotification | null {
        if (searchResults.length <= 0 && favourites.length <= 0) {
            return null;
        }

        const itemCount = searchResults
            .reduce((accumulator, value) => accumulator + value.items.length, 0);

        const results: QueryResult[] = toQueryResults(searchResults, 4);

        const favouritesChanges: ChangedFavouriteModel[] = favourites.map((favourite) => {
            return {
                from: {
                    img: favourite.oldItem ? favourite.oldItem.image : "",
                    link: favourite.oldItem ? favourite.oldItem.link : "",
                    price: favourite.oldItem ? favourite.oldItem.price : "",
                    title: favourite.oldItem ? favourite.oldItem.title : "",
                    location: favourite.oldItem ? favourite.oldItem.region : "",
                },
                to: {
                    img: favourite.newItem.image,
                    link: favourite.newItem.link,
                    price: favourite.newItem.price,
                    title: favourite.newItem.title,
                    location: favourite.newItem.region,
                },
            };
        });

        let subjectPrefix;
        if (itemCount === 1) {
            subjectPrefix = `[${itemCount} new item] `;
        } else {
            subjectPrefix = `[${itemCount} new items] `;
        }

        const notification = new EmailNotification(`${subjectPrefix}HardverApró Notifier Scheduled Report`)
            .withChangedFavourites(favouritesChanges)
            .withQueryResults(results);

        return notification;
    },

    // Web homepage: show all favourites as a simple list (no from/to columns)
    transformResultToWeb(searchResults: SearchResult[], favourites: FavouriteResult[]): EmailNotification | null {
        if ((searchResults || []).length <= 0 && (favourites || []).length <= 0) {
            return null;
        }

        const results: QueryResult[] = toQueryResults(searchResults || [], 6);
        const favouriteItems: ProductItemEntity[] = (favourites || [])
            .map((f) => f?.newItem)
            .filter((x): x is ProductItemEntity => Boolean(x));

        const favouritesRows: ItemRowModel[] = chunkIntoRows(favouriteItems, 6);

        const notification = new EmailNotification("HardverApró Notifier")
            .withQueryResults(results)
            .withFavourites(favouritesRows)
            .withNav("/settings", "Settings")
            .withContainerMaxWidth("980px")
            .asWeb(true);

        return notification;
    },

};
