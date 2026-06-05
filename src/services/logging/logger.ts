import util from "util";
import winston from "winston";

const level = process.env.LOG_LEVEL || "info";

const baseLogger = winston.createLogger({
    level,
    format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.printf(({ level: lvl, message, timestamp }) => {
            return `${timestamp} ${lvl}: ${message}`;
        }),
    ),
    transports: [new winston.transports.Console()],
});

function formatArgs(args: unknown[]): string {
    return util.format(...args);
}

export const logger = {
    info: (...args: unknown[]) => baseLogger.info(formatArgs(args)),
    warn: (...args: unknown[]) => baseLogger.warn(formatArgs(args)),
    error: (...args: unknown[]) => baseLogger.error(formatArgs(args)),
    debug: (...args: unknown[]) => baseLogger.debug(formatArgs(args)),
};
