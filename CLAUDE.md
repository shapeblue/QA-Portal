# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

QA Portal — a web dashboard displaying CloudStack PR health checks, upgrade test results, and flaky/failing test tracking. Data is read from a shared MySQL database (`cloudstack_tests`) that is populated by scraper scripts running **only on the production server**.

Production: `root@10.0.113.145:/root/QA-Portal` (nginx + SSH deploy). Default branch: `main`.

## Commands

Run from the repo root (`QA-Portal/`):

```bash
npm run install:all   # install root + client deps (run after fresh clone)
npm run dev           # start backend (:5001) and frontend (:3000) together
npm run server        # backend only — nodemon + ts-node on server/src/index.ts
npm run client        # frontend only — CRA dev server
npm run build         # build client (client/build/) then compile server (server/dist/)
npm start             # run compiled production server from server/dist/index.js
npm test              # client tests (react-scripts / Jest)
```

Run a single client test:
```bash
cd client && npx react-scripts test App.test.tsx          # one file
cd client && npx react-scripts test -t "name of test"     # by test name
```

Note: `npm run lint` is defined at root but `client` has no `lint` script — it will fail. Lint is the ESLint config baked into `react-scripts` (runs during `npm start`/`build`).

Deploy to production (commits, pushes, SSH builds + restarts):
```bash
./scripts/deploy.sh --skip-tests     # see header of deploy.sh for all flags
```

## Architecture

Two TypeScript apps plus standalone scraper scripts, all backed by one MySQL database.

**Backend — `server/src/index.ts` (single file, ~1500 lines).** Express 5 API. Holds a `mysql2` connection pool and a `queryWithRetry()` helper that retries on `ETIMEDOUT` with exponential backoff — use it for all queries rather than calling `pool.query` directly. The backend is read-only against the DB; it never scrapes or writes test data. All routes are `GET /api/*`:
- `/api/health-prs`, `/api/all-open-prs`, `/api/ready-to-merge`, `/api/pr/:number`
- `/api/upgrade-tests` (+ `/filters`, `/stats`)
- `/api/prs/:prNumber/test-failures`, `/api/test-failures/summary`, `/api/test-failures/test/:testName`, `/api/test-results/flaky`
- `/api/download-artifact/:artifactId` (proxies GitHub artifact downloads)
- `/api/health`

**Frontend — `client/` (React 18.2 + TS + React Router 6).** `client/src/App.tsx` is the shell: a four-tab UI (`health` / `all` / `upgrade` / `test-failures`) whose active tab is synced to the URL. API calls go through `client/src/services/api.ts`; shared types in `client/src/types/index.ts`; views in `client/src/components/`. Dev requests proxy to the backend via `"proxy": "http://localhost:5001"` in `client/package.json` — keep that port in sync with the server `PORT`.

**Scrapers — `scripts/`.** Plain Node.js scripts that write to the DB (PR scraping, milestone/package backfills, flaky-test summary rebuilds, dedup, PR state updates). Parsing logic lives in `scripts/lib/`; SQL migrations in `scripts/migrations/`. The main scraper runs via cron every 30 minutes in production.

### Key DB tables
`pr_health_labels`, `pr_trillian_comments` (smoketest results), `pr_codecov_comments`, `pr_lgtm_approvals`, `upgrade_test_results`, `test_failures_summary`, `package_builds`.

## Critical constraints

- **Never run scraper scripts (`scripts/*.js`, cron setup) locally or on more than one instance.** They write to the shared production DB; concurrent writers cause duplicates, race conditions, and constraint violations. Local development uses the web app (read-only) only.
- **Deployment must install ALL dependencies** (not `--production`) — the server is compiled with `tsc` on the production host, which needs devDependencies.
- After deploying, the **old server process must be killed** for new backend code to take effect (`deploy.sh` handles this unless `--no-restart`).
- Divergent-branch pulls use `git pull --rebase`.

## Config

Backend reads `server/.env` (copy from `.env.example`): `PORT`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `GITHUB_TOKEN` (for scrapers/artifact proxy).

## Keeping context current

A legacy `.copilot` file at the repo root carries a dated "Recent Changes" log and a convention to append significant changes (features, version bumps, schema/API/deploy changes). The footer version in the UI is bumped per release (currently v1.0.4). Further docs: `README.md`, `DEPLOYMENT.md`, `docs/LOCAL_SETUP.md`, `scripts/README.md`.
