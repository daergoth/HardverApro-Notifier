import express from "express";
import { EventEmitter } from "events";
import { HardveraproSearchService } from "../../services/search/hardverapro-search";
import { HardveraproFavouritesService } from "../../services/favourites/hardverapro-favourites";
import { logger } from "../../services/logging/logger";
import { AbstractSearchResultController } from "../abstract-view-controller";
import { HomeController } from "./home/home-controller";
import { SettingsController } from "./admin/settings-controller";

export class WebSearchResultController extends AbstractSearchResultController {

    private portNum: number;
    private readonly app = express();

    constructor(port: number = 3000) {
        super();
        this.portNum = port;
    }

    protected doRenderView(
        searchService: HardveraproSearchService, favouritesService: HardveraproFavouritesService): EventEmitter {
        
        const webControllers = [new HomeController(searchService, favouritesService), new SettingsController(searchService, favouritesService)];

        webControllers.forEach((controller) => controller.registerSelf(this.app));

        let eventEmitter = new EventEmitter();

        this.app.listen(this.portNum, () => {
            logger.info(`Hardverapro-notifier listening at port ${this.portNum}`);
        })
        .once('close', () => eventEmitter.emit("close"))
        .once('error', () => eventEmitter.emit("close"));

        return eventEmitter;
    }

}
