import * as fs from "fs";
import * as Handlebars from "handlebars";
import { EmailModel } from "../../../services/email/email-model";
import { EmailNotification } from "../../../services/email/email-notification";

export class HomeRenderer {

    private templateContent!: string;
    private compiledTemplate!: HandlebarsTemplateDelegate;

    constructor(
        public templateFileName: string,
    ) {
        this.compileTemplate(templateFileName);
    }

    public render(notification: EmailNotification | null): string {
        const transformedNotification = this.transformNotification(notification);
        return this.compiledTemplate(transformedNotification);
    }

    private compileTemplate(templateFileName: string) {
        const baseHeader = fs.readFileSync("./src/view/templates/base-header.hbs", "utf-8");
        Handlebars.registerPartial("baseHeader", baseHeader);

        this.templateContent = fs.readFileSync(templateFileName, "utf-8");
        this.compiledTemplate = Handlebars.compile(this.templateContent);
    }

    private transformNotification(notification: EmailNotification | null): EmailModel {
        if (!notification) {
            return {
                changedFavourites: [],
                favourites: [],
                generatedAt: new Date().toISOString(),
                queryResults: [],
                isWeb: true,
            };
        }

        return {
            changedFavourites: notification.changedFavourites,
            favourites: notification.favourites || [],
            generatedAt: notification.generatedAt,
            queryResults: notification.queryResults,
            isWeb: true,
            navHref: notification.navHref,
            navText: notification.navText,
        };
    }

}
