import * as fs from "fs";
import * as Handlebars from "handlebars";
import { EmailModel } from "../../services/email/email-model";
import { EmailNotification } from "../../services/email/email-notification";

export class EmailRenderer {

    private templateContent!: string;
    private compiledTemplate!: HandlebarsTemplateDelegate;

    constructor(
        public templateFileName: string,
    ) {
        this.compileTemplate(templateFileName);
    }

    public render(notification: EmailNotification): string {
        const transformedNotification = this.transformNotification(notification);
        return this.compiledTemplate(transformedNotification);
    }

    private compileTemplate(templateFileName: string) {
        // Shared header partial used by email + web templates
        try {
            const baseHeader = fs.readFileSync("./src/view/templates/base-header.hbs", "utf-8");
            Handlebars.registerPartial("baseHeader", baseHeader);
        } catch {
            // Optional in case the renderer is used before templates are present.
        }

        this.templateContent = fs.readFileSync(templateFileName, "utf-8");
        this.compiledTemplate = Handlebars.compile(this.templateContent);
    }

    private transformNotification(notification: EmailNotification): EmailModel {
        return {
            changedFavourites: notification.changedFavourites,
            favourites: notification.favourites,
            generatedAt: notification.generatedAt,
            queryResults: notification.queryResults,
            isWeb: notification.isWeb === true,
            navHref: notification.navHref,
            navText: notification.navText,
            containerMaxWidth: notification.containerMaxWidth,
        };
    }

}
