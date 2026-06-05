# AGENTS.md — AI assistant guidance for this repo

Purpose
-------
This file gives concise, actionable information to AI coding agents so they can be productive quickly.

Quick commands
--------------
- Install dependencies: `npm install`
- Build: `npm run tsc` (see `package.json`)
- Build + run: `npm run start` (runs `tsc` then `node dist/app.js`)

Relevant files
--------------
- [README.md](README.md) — general project overview and usage
- [package.json](package.json) — scripts and dependencies
- [docker/Dockerfile](docker/Dockerfile) and [docker/docker-compose.yaml](docker/docker-compose.yaml) — container/run configuration
- [src/app.ts](src/app.ts) — application entrypoint
- [src/services](src/services) — business logic (DB, scraping, email)
- [src/view](src/view) — rendering and controller layers (email/web views)
- `mongodb_data/` — local MongoDB data (do not modify in CI)

Architecture notes
------------------
- Node.js + TypeScript project that compiles to `dist/` via `tsc`.
- Core areas: `services/` (scraping, DB, email), `view/` (rendering/controllers), and `src/app.ts` (startup).
- Scheduled jobs and container entry scripts live under `docker/` (see [docker/crontab.txt](docker/crontab.txt), [docker/start-job.sh](docker/start-job.sh), [docker/entry.sh](docker/entry.sh)).

Conventions & guidance for agents
--------------------------------
- Prefer linking to existing docs instead of copying content (see README and files above).
- Respect the TypeScript build step: run `npm run tsc` before executing Node JS files.
- Avoid touching `mongodb_data/` in edits; treat it as persistent test/dev data.
- Tests: there are no automated tests defined (`npm test` is placeholder).
- When suggesting new files, place them under `src/` and follow existing folder structure.

When to run commands locally
----------------------------
- Use `npm run tsc` to verify TypeScript compilation.
- Use `npm run start` to run the compiled application (useful for manual verification).

If you need more
---------------
If you'd like, I can also:
- Add a small CONTRIBUTING.md or developer-setup doc linking common env vars and Node version.
- Create a `.github/copilot-instructions.md` with similar content for GitHub-specific guidance.
