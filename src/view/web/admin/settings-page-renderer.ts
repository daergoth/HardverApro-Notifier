import * as fs from "fs";
import * as Handlebars from "handlebars";

export class SettingsPageRenderer {

    private templateContent!: string;
    private compiledTemplate!: HandlebarsTemplateDelegate;

    constructor(
        public templateFileName: string,
    ) {
        this.compileTemplate(templateFileName);
    }

    public render(model: Record<string, unknown> = {}): string {
        return this.compiledTemplate(model);
    }

    private compileTemplate(templateFileName: string) {
        const baseHeader = fs.readFileSync("./src/view/templates/base-header.hbs", "utf-8");
        Handlebars.registerPartial("baseHeader", baseHeader);

        this.templateContent = fs.readFileSync(templateFileName, "utf-8");
        this.compiledTemplate = Handlebars.compile(this.templateContent);
    }
}
