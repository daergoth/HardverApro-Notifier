import * as crypto from "crypto";
import { AbstractRepository } from "../abstract-repository";
import { ProductItemEntity } from "./product-item";

export class ProductRepository extends AbstractRepository<ProductItemEntity> {

    public static getInstance(): ProductRepository {
        if (!ProductRepository.instance) {
            ProductRepository.instance = new ProductRepository(ProductRepository.COLLECTION_NAME);
        }

        return ProductRepository.instance;
    }

    private static readonly COLLECTION_NAME: string = "searchItems";

    private static instance: ProductRepository;

    public async save(entity: ProductItemEntity): Promise<ProductItemEntity | null> {
        const col = await this.collection;
        const canonicalLink = ProductItemEntity.normalizeLink(entity.link);
        const id = this.hashLink(canonicalLink);

        await col.updateOne(
            { _id: id },
            {
                $set: {
                    _id: id,
                    createdDate: new Date(),
                    image: entity.image,
                    link: canonicalLink,
                    price: entity.price,
                    region: entity.region,
                    title: entity.title,
                },
            },
            { upsert: true },
        );

        const doc: any = await col.findOne({ _id: id });
        if (!doc) {
            return null;
        }

        return new ProductItemEntity(doc.image, doc.title, doc.link, doc.price, doc.region);
    }

    public async delete(entity: ProductItemEntity): Promise<void> {
        const col = await this.collection;
        await col.deleteOne({ _id: this.hashLink(ProductItemEntity.normalizeLink(entity.link)) });
    }

    public async deleteId(id: string): Promise<void> {
        const col = await this.collection;
        await col.deleteOne({ _id: id });
    }

    public async findByLink(itemLink: string): Promise<ProductItemEntity | null> {
        const canonicalLink = ProductItemEntity.normalizeLink(itemLink);
        const canonicalId = this.hashLink(canonicalLink);
        const legacyId = this.hashLink(itemLink);

        const col = await this.collection;
        let doc: any = await col.findOne({ _id: canonicalId });
        if (!doc && legacyId !== canonicalId) {
            doc = await col.findOne({ _id: legacyId });
        }
        if (!doc) {
            return null;
        }

        return new ProductItemEntity(doc.image, doc.title, doc.link, doc.price, doc.region);
    }

    private hashLink(link: string): string {
        return crypto.createHash("sha1").update(link).digest("hex").toString();
    }

}
