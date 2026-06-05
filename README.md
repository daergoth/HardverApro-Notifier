# HardverApró Notifier

A compact Node.js + TypeScript service that periodically checks HardverApró, records search results in MongoDB, detects new or changed listings, and sends concise email notifications. The project highlights practical concerns like polite scraping, change detection heuristics, durable storage, and templated notification rendering — all in a small, easy-to-follow codebase.

HardverApró (hardverapro.hu) is a Hungarian classifieds/marketplace site focused on computer hardware, electronics and related items. This project targets that site as a realistic example domain for scraping and monitoring listings.

## Quick install & setup

Prerequisites: Node.js (tested on 20.x), Docker (optional).

1. Install dependencies

```bash
npm install
```

1. Build TypeScript

```bash
npm run tsc
```

1. Run locally

```bash
npm start
```

## Run with Docker (optional)

Build and run using the provided Docker files in `docker/`:

```bash
docker build -t hardverapro-notifier:0.1 -f docker/Dockerfile .
docker run -d --name hardverapro-notifier --network mongo-network -p 55555:3000 \
  --cap-add=SYS_TIME --cap-add=SYS_NICE --restart unless-stopped hardverapro-notifier:0.1
```

## Project description

The application periodically executes configured searches on HardverApró, stores results in MongoDB, compares with previous runs, and sends email notifications for new or changed items. It's designed as a small, focused service suitable for a portfolio or interview demo.

## Project structure

- [src/app.ts](src/app.ts) — application entrypoint and server startup
- [src/services](src/services) — core services: scraping, DB repositories, email sending
- [src/services/scraping](src/services/scraping) — scraper abstractions and site-specific scrapers
- [src/services/db](src/services/db) — MongoDB repositories and utilities
- [src/view](src/view) — email/web rendering and controllers
- [docker/](docker/) — Dockerfile, compose, and container scripts
- [package.json](package.json) — scripts and dependencies
- [AGENTS.md](AGENTS.md) — developer/agent guidance

## Overall program flow

At a glance:

1. Scheduler: a cron job or internal scheduler wakes up according to configured intervals and enqueues a search job.
1. Scraping: site-specific scrapers fetch HTML and parse it into structured `SearchResult` objects. Scrapers include simple retry/backoff and basic caching to avoid hitting the site too aggressively.
1. Normalize & persist: parsed results are normalized and stored in MongoDB via repository classes. Each run is timestamped so previous snapshots remain available.
1. Diffing & detection: repository logic computes diffs between the latest snapshot and the most recent previous snapshot. Items are classified as `new`, `removed`, or `updated` (field-level comparisons are used where useful).
1. Rendering & notification: when noteworthy changes are found, the renderer composes a friendly email (templated Handlebars HTML + plaintext fallback) listing changes and links.
1. Delivery & retries: the email sender attempts to deliver via configured SMTP; transient failures are retried with backoff and permanent failures get logged for manual inspection.
1. Observability: success/failure events and summary logs are recorded; errors include context to help debugging (search query, last successful run timestamp).

Compact flow (visual):

Scraper Trigger → Scraper → Normalizer → DB Snapshot → Diff Engine → Renderer → Email Sender

Key implementation notes:

- Scheduler: implemented via cron in container or started process for local runs.
- Scraper: separate classes per site, returning a unified `SearchResult` model.
- Diffing: lightweight comparison (ID + selected fields) to avoid noise and focus on meaningful changes.
- Emails: HTML templates live under `src/view/email/templates/`; include subject, summary, and per-item sections.

Why this matters (talking points for interviews):

- Demonstrates system design: separated concerns, durable storage, idempotent jobs, and retry policies.
- Shows practical engineering: scraping etiquette (rate limits, caching), change detection heuristics, and templated notification delivery.

## Developer notes

- Database: default connection expects MongoDB at `mongodb:27017`. Update `src/config.json` and keep it aligned with `src/config-example.json` (config is validated at startup).
- For development, run `npm run tsc -- -w` in one terminal and `node dist/app.js` in another to iterate quickly.
