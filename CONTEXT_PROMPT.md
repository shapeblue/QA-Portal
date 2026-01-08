# QA Portal - Context Restoration Prompt

Use this prompt when you need to restore full context about the QA Portal application.

---

## Quick Context Prompt

```
I'm working on the QA Portal (CloudStack PR Health Dashboard) project located at /Users/borisstoyanov/Documents/qa-portal/QA-Portal.

Please review the following to understand the application:

1. Project overview and structure: README.md
2. Architecture and key files:
   - Frontend: client/src/App.tsx (main React app)
   - Backend: server/src/index.ts (Express API)
   - Deployment: scripts/deploy.sh
3. Key documentation:
   - DEPLOYMENT.md (deployment process and architecture)
   - docs/LOCAL_SETUP.md (local development setup)
   - scripts/README.md (scraper and automation scripts)
4. Tech stack:
   - Frontend: React 18.2, TypeScript, React Router 6
   - Backend: Node.js/Express, TypeScript, MySQL2
   - Production: nginx reverse proxy, systemd/pm2 for services
5. Key features:
   - Health check PR dashboard with smoke test results
   - Upgrade tests viewer with heatmap, filtering, and historical views
   - Flaky tests tracking system
   - All open PRs view with merge status
   - GitHub PR scraper (runs on production only via cron)
6. Production server: root@10.0.113.145 at /root/QA-Portal
7. Deployment command: ./scripts/deploy.sh [--skip-tests]

Current working directory is the project root. The app serves CloudStack quality metrics and test results from a MySQL database.
```

---

## Full Context Restoration Prompt

For a more detailed context restoration, use this extended prompt:

```
I'm working on the QA Portal project - a CloudStack PR Health Dashboard at /Users/borisstoyanov/Documents/qa-portal/QA-Portal.

Please review these key aspects:

PROJECT STRUCTURE:
- Root: package.json with monorepo scripts (dev, build, test, deploy)
- client/: React frontend (TypeScript, Create React App)
  - src/App.tsx: Main app with tab navigation
  - src/components/: PRCard, UpgradeTests, AllPRsView, TestFailuresRouter, etc.
  - Build output: client/build/
- server/: Express backend (TypeScript)
  - src/index.ts: REST API with MySQL database connection
  - Compiled output: server/dist/
- scripts/: Automation and deployment
  - deploy.sh: Main deployment script with SSH to production
  - scrape-github-prs.js: GitHub PR data scraper (production only)

TECH STACK:
Frontend:
- React 18.2.0, TypeScript 4.9.5
- React Router 6.30.2 for navigation
- Axios for API calls
- Create React App (react-scripts 5.0.1)

Backend:
- Node.js with Express 5.1.0
- TypeScript 5.9.3
- MySQL2 3.15.3 for database
- CORS, dotenv for configuration

FEATURES:
1. Health Check Runs Tab:
   - Displays PRs with [HEALTH] label
   - Shows smoke test results per hypervisor (KVM, XenServer, VMware)
   - Test pass/fail rates, approvals, CodeCov integration
   - Search by PR number or URL

2. All Open PRs Tab:
   - Lists all open PRs with ready-to-merge status
   - Filters: review approved, checks passed, not draft
   - Shows approval counts and health check status

3. Upgrade Tests Tab:
   - Heatmap view: Visual grid of upgrade paths and success rates
   - All Upgrade Paths: Accordion with expandable test details
   - Historical Runs: Chronological table
   - Filters: version (from/to), distro, hypervisor, status
   - Statistics dashboard

4. Flaky Tests Tab:
   - Tracks recurring test failures
   - Shows failure frequency and affected PRs
   - Helps identify unstable tests

DEPLOYMENT:
- Production server: root@10.0.113.145
- Path: /root/QA-Portal
- Deploy script: ./scripts/deploy.sh [--skip-tests]
- Process:
  1. Checks uncommitted changes (commits if needed)
  2. Runs tests (unless --skip-tests)
  3. Pushes to GitHub (main branch)
  4. SSH to production, pulls changes with rebase
  5. Installs dependencies (includes devDependencies for TypeScript)
  6. Builds client (React) and server (TypeScript)
  7. Restarts backend service (pkill + nohup node)
- Frontend served by nginx, backend on port 5001

DATABASE:
MySQL tables:
- pr_health_labels: PR info and labels
- pr_trillian_comments: Smoke test results
- pr_codecov_comments: Code coverage data
- pr_lgtm_approvals: PR reviews/approvals
- upgrade_test_results: Upgrade test data
- test_failures_summary: Flaky test tracking

IMPORTANT NOTES:
- Scraper scripts run ONLY on production (avoid duplicates)
- Multi-instance safe: Web app (read-only)
- Single instance only: All scraper/writer scripts
- Database credentials in server/.env (not committed)
- Current footer version: v1.0.4

API ENDPOINTS:
- GET /api/health-prs - Health check PRs
- GET /api/pr/:number - Specific PR
- GET /api/all-prs - All open PRs
- GET /api/upgrade-tests - Upgrade test results (with filters)
- GET /api/upgrade-tests/filters - Available filter options
- GET /api/upgrade-tests/stats - Test statistics
- GET /api/flaky-tests - Flaky test summary
- GET /api/health - Health check

Current working directory: /Users/borisstoyanov/Documents/qa-portal/QA-Portal
```

---

## Quick Commands Reference

```bash
# Development
npm run dev          # Start both frontend and backend
npm run client       # Start frontend only (port 3000)
npm run server       # Start backend only (port 5001)

# Building
npm run build        # Build both client and server
npm run build:client # Build React app
npm run build:server # Compile TypeScript

# Testing & Linting
npm test            # Run tests
npm run lint        # Run linter

# Deployment
./scripts/deploy.sh              # Full deploy with tests
./scripts/deploy.sh --skip-tests # Deploy without tests
./scripts/deploy.sh --no-restart # Deploy without service restart

# Production Server (SSH)
ssh root@10.0.113.145
cd /root/QA-Portal
tail -f /tmp/qa-server.log       # View server logs
ps aux | grep node               # Check running processes
```

---

## Key Files to Review

When starting work, review these files for context:

1. **README.md** - Project overview and features
2. **DEPLOYMENT.md** - Deployment architecture and guidelines
3. **client/src/App.tsx** - Main React component with routing
4. **server/src/index.ts** - Backend API and database connection
5. **scripts/deploy.sh** - Deployment automation script
6. **package.json** (root, client, server) - Dependencies and scripts

---

## Recent Changes

- Fixed deployment script to install all dependencies (including devDependencies) for TypeScript compilation
- Updated git pull to use --rebase to handle divergent branches
- Footer version incremented to v1.0.4
- Deployment now properly compiles TypeScript server code
- Created auto-context system (.copilot, .copilot-context, .github-copilot-setup.md) - 2025-12-30
- Fixed PR count bug: Updated GitHub token and cleaned up 23 stale "open" PRs that were actually closed - 2026-01-08
- Fixed missing PR data: Modified scraper to insert placeholder row for PRs with no labels (ensures all 227 PRs appear in queries) - 2026-01-08
- All PR attributes (LGTMs, tests passed, needs-testing, ready-to-merge) now correctly synced from GitHub - 2026-01-08

## ⚠️ IMPORTANT: Copilot Self-Update Instructions

**GitHub Copilot MUST update CONTEXT_PROMPT.md and .copilot files after every significant change!**

After making any changes to the codebase, you should:
1. Update the "Recent Changes" section in both files with date
2. Update version numbers if changed
3. Add new features to the features list
4. Update API endpoints if new ones added
5. Note any architectural or deployment changes

This practice ensures:
- Context persists across Copilot sessions
- New sessions have accurate, up-to-date information
- No loss of important project knowledge
- Faster onboarding for new Copilot sessions

**Format for updates:**
```
- Brief description of change - YYYY-MM-DD
```

---

Use the appropriate prompt based on how much context you need restored!
