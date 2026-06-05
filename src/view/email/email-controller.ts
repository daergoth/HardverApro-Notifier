import { EventEmitter } from "events";
import * as fs from "fs";
import { EmailNotification } from "../../services/email/email-notification";
import { EmailSender } from "../../services/email/email-sender";
import { HardveraproSearchService } from "../../services/search/hardverapro-search";
import { HardveraproFavouritesService } from "../../services/favourites/hardverapro-favourites";
import { logger } from "../../services/logging/logger";
import { SearchResult } from "../../services/search/search-result";
import { AbstractSearchResultController } from "../abstract-view-controller";
import { EmailRenderer } from "./email-renderer";
import { ResultsTransformer } from "./email-transform";
import { SearchQueryRepository } from "../../services/db/repositories";
import { SearchQueryEntity } from "../../services/db/search/search-query";

const emailRenderer = new EmailRenderer("./src/view/email/templates/mail-template.hbs");
const emailSender = new EmailSender(emailRenderer);

export class EmailSearchResultController extends AbstractSearchResultController {

    private doDryRun: boolean;

    constructor(dryRun: boolean = false) {
        super();
        this.doDryRun = dryRun;
    }

    protected doRenderView(
        searchService: HardveraproSearchService,
        favouritesService: HardveraproFavouritesService): EventEmitter {

        const eventEmitter = new EventEmitter();

        (async () => {
            try {
                const searchQueries = await this.getSearchQueries();
                logger.info("Found search queries:", searchQueries.length);

                const searchResults: SearchResult[] = await searchService.searchForNewItems(searchQueries, { fresh: true });
                const favourites = await favouritesService.getDiffFavourites({ fresh: true });

                logger.info("Found search results:", searchResults.length);

                const notification: EmailNotification | null = ResultsTransformer.transformResultToEmail(searchResults, favourites);

                if (!notification) {
                    logger.info("No notification to send");
                    return;
                }

                logger.info("Transformed to email notification, sending...");

                if (this.doDryRun) {
                    logger.info("Dry run mode - writing to file instead");
                    const renderedNotification = emailRenderer.render(notification);
                    fs.writeFileSync("rendered-notification.html", renderedNotification);
                    return;
                }

                await emailSender.sendNotification(notification);
            } catch (error) {
                logger.error("Error in email controller:", error);
            } finally {
                logger.info("Email controller completed");
                eventEmitter.emit("close");
            }
        })();

        return eventEmitter;
    }

    protected getSearchQueries(): Promise<SearchQueryEntity[]> {
        return SearchQueryRepository.getInstance().findAll();
    }
}
