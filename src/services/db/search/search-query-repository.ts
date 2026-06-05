import * as crypto from "crypto";
import { AbstractRepository } from "../abstract-repository";
import { SearchQueryEntity } from "./search-query";

export class SearchQueryRepository extends AbstractRepository<SearchQueryEntity> {

    public static getInstance(): SearchQueryRepository {
        if (!SearchQueryRepository.instance) {
            SearchQueryRepository.instance = new SearchQueryRepository(SearchQueryRepository.COLLECTION_NAME);
        }

        return SearchQueryRepository.instance;
    }

    private static readonly COLLECTION_NAME: string = "searchQueries";

    private static instance: SearchQueryRepository;

    public async save(entity: SearchQueryEntity): Promise<SearchQueryEntity | null> {
        const col = await this.collection;
        const id = this.hash(entity.id);

        await col.updateOne(
            { _id: id },
            {
                $set: {
                    _id: id,
                    createdDate: new Date(),
                    query: entity.query,
                    category: entity.category,
                    regionType: entity.regionType,
                    regionId: entity.regionId,
                },
            },
            { upsert: true },
        );

        const doc: any = await col.findOne({ _id: id });
        if (!doc) {
            return null;
        }

        return new SearchQueryEntity(doc.query, doc.category, doc.regionType, doc.regionId);
    }

    public async delete(entity: SearchQueryEntity): Promise<void> {
        const col = await this.collection;
        await col.deleteOne({ _id: this.hash(entity.id) });
    }

    public async deleteId(id: string): Promise<void> {
        const col = await this.collection;
        await col.deleteOne({ _id: id });
    }

    private hash(str: string): string {
        return crypto.createHash("sha1").update(str).digest("hex").toString();
    }



}
