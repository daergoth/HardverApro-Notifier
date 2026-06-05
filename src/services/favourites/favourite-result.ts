import { ProductItemEntity } from "../db/product/product-item";

export class FavouriteResult {
    constructor(
        public oldItem: ProductItemEntity | null,
        public newItem: ProductItemEntity,
    ) {}

    public toString = (): string => {
        const oldValue = this.oldItem ? this.oldItem.toString() : "null";
        return `FavouriteResult(oldItem: ${oldValue}, newItem: ${this.newItem.toString()})`;
    }
}