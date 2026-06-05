import { mapWithConcurrency, sleep } from "./async-utils";
import { with429Retry } from "./http-retry";

/**
 * Small base class for services that fetch + parse HTML.
 * Centralizes retry/backoff and concurrency helpers.
 */
export abstract class AbstractScraperService {
    protected readonly sleep = sleep;
    protected readonly mapWithConcurrency = mapWithConcurrency;
    protected readonly with429Retry = with429Retry;
}
