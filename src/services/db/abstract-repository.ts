import { Collection, Filter } from "mongodb";
import { Database } from "./db";

type RepositoryDoc<T> = T & { _id: string };

export abstract class AbstractRepository<T> {

    private static db: Database = Database.getInstance();

    protected colName: string;
    protected collection: Promise<Collection<RepositoryDoc<T>>>;

    constructor(collectionName: string) {
        this.colName = collectionName;
        this.collection = AbstractRepository.db.getCollection<RepositoryDoc<T>>(this.colName);
    }

    public findById(id: string): Promise<T | null> {
        const filter = { _id: id } as Filter<RepositoryDoc<T>>;
        return this.collection.then((col) => col.findOne(filter) as Promise<T | null>);
    }

    public findAll(): Promise<T[]> {
        return this.collection.then((col) => {
            return col.find({}).toArray() as Promise<T[]>;
        });
    }

    public abstract save(entity: T): Promise<T | null>;
    public abstract delete(entity: T): Promise<void>;
    public abstract deleteId(id: string): Promise<void>;

}
