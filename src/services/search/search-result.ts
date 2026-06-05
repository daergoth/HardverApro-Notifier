import { ProductItemEntity } from "../db/product/product-item";

export class SearchResult {
    constructor(
        public query: string,
        public category: string,
        public count: number,
        public items: ProductItemEntity[],
        public regionType?: "city" | "county" | "none",
        public regionId?: number,
    ) {}

    public toString = (): string => {
        const itemsSerialized: string[] = [];
        this.items.forEach((item) => {
            itemsSerialized.push(item.toString());
        });
        return `SearchResult(regionType: ${this.regionType}, regionId: ${this.regionId}, count: ${this.count}, items: ${itemsSerialized.join()})`;
    }
}
