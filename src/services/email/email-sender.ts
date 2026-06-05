import * as nodemailer from "nodemailer";
import { emailConfig } from "../../config";
import { logger } from "../logging/logger";
import { EmailRenderer } from "../../view/email/email-renderer";
import { EmailNotification } from "./email-notification";

import Mail = require("nodemailer/lib/mailer");
import SMTPTransport = require("nodemailer/lib/smtp-transport");

export class EmailSender {

    public emailRenderer: EmailRenderer;
    private transporter: Mail;

    constructor(renderer: EmailRenderer) {
        const smtpHost = process.env.SMTP_HOST || emailConfig.host;
        const smtpPort = process.env.SMTP_PORT ? Number.parseInt(process.env.SMTP_PORT, 10) : emailConfig.port;
        const smtpUser = process.env.SMTP_USER || emailConfig.user;
        const smtpPass = process.env.SMTP_PASS || emailConfig.pass;
        const smtpSecure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : false;

        const options: SMTPTransport.Options = {
            auth: {
                pass: smtpPass,
                user: smtpUser,
            },
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            requireTLS: true,
        };
        this.transporter = nodemailer.createTransport(options);

        this.emailRenderer = renderer;
    }

    public sendNotification(notification: EmailNotification) {
        const from = process.env.EMAIL_FROM || emailConfig.from;
        const to = process.env.EMAIL_TO
            ? process.env.EMAIL_TO.split(",").map((s) => s.trim()).filter(Boolean)
            : emailConfig.to;

        const mailOptions: Mail.Options = {
            from,
            html: this.emailRenderer.render(notification),
            subject: notification.subject,
            to,
        };

        return this.transporter.sendMail(mailOptions)
            .then((info) => {
                logger.info(`Message sent: ${info.response}`);
            })
            .catch((error) => {
                logger.error("Failed to send email:", error);
                throw error;
            });
    }
}
