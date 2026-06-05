import { Database } from "./services/db/db";
import { searchQueries } from "./config";
import { SearchQueryRepository } from "./services/db/repositories";
import { SearchQueryEntity } from "./services/db/search/search-query";
import { EmailSearchResultController } from "./view/email/email-controller";
import { WebSearchResultController } from "./view/web/web-view-controller";
import { logger } from "./services/logging/logger";

const db = Database.getInstance();
const args = process.argv.slice(2);

const isWebMode = args.includes("--web");
const isDryRun = args.includes("--dry-run");

const portArgIndex = args.indexOf("--port");
const portFromArgs = (portArgIndex !== -1 && args[portArgIndex + 1])
    ? Number.parseInt(args[portArgIndex + 1], 10)
    : undefined;
const webPort = Number.isFinite(portFromArgs) ? (portFromArgs as number) : 3000;

const emailController = new EmailSearchResultController(isDryRun);
const webController = new WebSearchResultController(webPort);

logger.info({ args, isWebMode, isDryRun, webPort });

(async () => {
    try {
        // Wait for all search queries to be saved
        await Promise.all(searchQueries.map((query) => {
            let entity = new SearchQueryEntity(query.query, query.category);
            return SearchQueryRepository.getInstance().save(entity);
        }));

        const controllerEventEmitter =
            isWebMode ? webController.renderView() : emailController.renderView();

        controllerEventEmitter
            .once("close", async () => {
                try {
                    await db.close();
                } catch (e) {
                    logger.error("Failed to close DB:", e);
                }
            });
    } catch (error) {
        logger.error("Error initializing app:", error);
        try {
            await db.close();
        } catch (e) {
            logger.error("Failed to close DB:", e);
        }
    }
})();
