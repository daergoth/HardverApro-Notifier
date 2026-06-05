import { Collection, Db, Document, MongoClient } from "mongodb";
import { mongoConfig } from "../../config";

export class Database {

    public static getInstance(): Database {
        if (!Database.instance) {
            Database.instance = new Database(
                mongoConfig.host,
                mongoConfig.port,
                mongoConfig.dbName,
            );
        }

        return Database.instance;
    }

    private static instance: Database;

    private client: Promise<MongoClient>;
    private db: Promise<Db>;

    private constructor(
        public host: string,
        public port: number,
        public dbName: string,
    ) {
        const url = `mongodb://${host}:${port}?authSource=admin`;
        const client = new MongoClient(url);
        this.client = this.connectWithRetry(client);
        this.db = this.client.then((cl) => cl.db(dbName));
    }

    private async connectWithRetry(client: MongoClient): Promise<MongoClient> {
        const maxAttempts = 20;
        const initialDelayMs = 500;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                await client.connect();
                return client;
            } catch (error) {
                if (attempt === maxAttempts) {
                    throw error;
                }

                const delayMs = Math.min(initialDelayMs * attempt, 5000);
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }

        throw new Error("Failed to connect to MongoDB");
    }

    public getCollection<T extends Document = Document>(collectionName: string): Promise<Collection<T>> {
        return this.db.then((db) => db.collection<T>(collectionName));
    }

    public async close(): Promise<void> {
        const cl = await this.client;
        await cl.close();
    }

}
