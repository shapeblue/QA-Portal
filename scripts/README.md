# QA Portal Scripts Documentation

## ⚠️ PRODUCTION ONLY - DO NOT RUN LOCALLY

**These scripts run ONLY on the production server.** They perform database writes that must be executed by a single instance to prevent:
- Race conditions
- Duplicate data entries
- Database constraint violations

**For local development:**
- ❌ Do NOT run any scraper scripts
- ❌ Do NOT set up cron jobs for these scripts
- ✅ Use the web application only (read-only operations)

## Overview

This directory contains scripts for managing the CloudStack QA Portal's GitHub PR scraper and monitoring systems.

## Core Scraper Scripts

### scrape-github-prs.js
**Purpose:** Main GitHub PR scraper - collects PR data including approvals, smoke tests, code coverage, and labels.

**Usage:**
```bash
# Scrape all open PRs (default)
node scripts/scrape-github-prs.js

# Scrape specific PR
node scripts/scrape-github-prs.js --pr-number=12345

# Scrape all PRs (including those without health checks)
node scripts/scrape-github-prs.js --all
```

**Features:**
- Scrapes LGTM approvals/reviews/rejections
- Collects codecov coverage data
- Extracts Trillian smoketest results per hypervisor
- Updates PR states (open/closed/merged)
- Rate limit aware with delays

**Requirements:**
- GitHub token in `server/.env`
- Database connection
- Runs automatically via cron every 30 minutes

---

### update-pr-states.js
**Purpose:** Batch update PR states (open/closed/merged) for all PRs in database.

**Usage:**
```bash
# Update oldest 50 PRs (default)
node scripts/update-pr-states.js

# Update specific number of PRs
node scripts/update-pr-states.js --batch=100

# Update all PRs (slow!)
node scripts/update-pr-states.js --all
```

**Features:**
- Rate limit aware (200ms delay between requests)
- Shows remaining API quota
- Updates state and last_checked timestamp
- Processes oldest PRs first

---

## Management Scripts

### manage-scraper.sh
**Purpose:** Manage the GitHub scraper lifecycle.

**Usage:**
```bash
# Show status
./scripts/manage-scraper.sh status

# Start scraper cron job
./scripts/manage-scraper.sh start

# Stop scraper cron job
./scripts/manage-scraper.sh stop

# View logs
./scripts/manage-scraper.sh logs

# Run once manually
./scripts/manage-scraper.sh run-once
```

---

### monitor-scraper.sh
**Purpose:** Monitor scraper health and restart if crashed. Runs via cron every 30 minutes.

**Features:**
- Checks if scraper is running
- Verifies it's not hung/frozen
- Restarts if issues detected
- Logs to `/tmp/scraper-monitor.log`

**Manual run:**
```bash
./scripts/monitor-scraper.sh
```

---

### scraper-cron.sh
**Purpose:** Cron wrapper for the main scraper. Handles environment setup and logging.

**Features:**
- Sets up PATH and environment
- Logs to `/var/log/cloudstack-pr-scraper.log`
- Keeps log file manageable (last 1000 lines)
- Called by cron every 30 minutes

---

## Setup Scripts

### setup-cron.sh
**Purpose:** Install cron jobs for scraper and monitoring.

**Usage:**
```bash
./scripts/setup-cron.sh
```

**Installs:**
- Scraper: Every 30 minutes
- Monitor: Every 30 minutes
- Portal health check: Every 5 minutes

---

### setup-monitoring.sh
**Purpose:** Setup monitoring and health check systems.

**Usage:**
```bash
./scripts/setup-monitoring.sh
```

---

## Utility Scripts

### scraper_health_check.sh (in /tmp)
**Purpose:** Comprehensive health check for scraper system.

**Usage:**
```bash
/tmp/scraper_health_check.sh
```

**Checks:**
- Environment files (.env)
- Cron job configuration
- Last scraper run status
- GitHub API rate limits
- Authentication status

---

## Directory Structure

```
/root/QA-Portal/scripts/
├── README.md                    (this file)
│
├── scrape-github-prs.js        (main scraper)
├── update-pr-states.js         (state updater)
│
├── manage-scraper.sh           (lifecycle management)
├── monitor-scraper.sh          (health monitor)
├── scraper-cron.sh            (cron wrapper)
│
├── setup-cron.sh              (cron installer)
└── setup-monitoring.sh        (monitoring setup)
```

---

## Environment Variables

All scripts require environment variables in `server/.env`:

```env
# GitHub API
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxx

# Database
DB_HOST=10.0.113.145
DB_PORT=3306
DB_NAME=cloudstack_tests
DB_USER=results
DB_PASSWORD=P@ssword123
```

---

## Cron Schedule

Current cron jobs (via `crontab -l`):

```bash
# Scraper - every 30 minutes
*/30 * * * * /root/QA-Portal/scripts/scraper-cron.sh

# Scraper Monitor - every 30 minutes
*/30 * * * * /root/QA-Portal/scripts/monitor-scraper.sh

# Portal Health Check - every 5 minutes
*/5 * * * * /usr/local/bin/qa-portal-monitor.sh
```

---

## Logs

### Scraper Logs
```bash
# Main scraper log
tail -f /var/log/cloudstack-pr-scraper.log

# Monitor log
tail -f /tmp/scraper-monitor.log

# Portal health check
tail -f /var/log/qa-portal-monitor.log
```

---

## Troubleshooting

### Rate Limit Errors (403)

**Symptoms:** "API rate limit exceeded for [IP]"

**Solutions:**
1. Check token is set: `grep GITHUB_TOKEN /root/QA-Portal/server/.env`
2. Verify authentication: 
   ```bash
   TOKEN=$(grep GITHUB_TOKEN /root/QA-Portal/server/.env | cut -d'=' -f2)
   curl -H "Authorization: token $TOKEN" https://api.github.com/rate_limit
   ```
3. Should show 5000 limit (authenticated), not 60 (unauthenticated)

### Missing PRs in Portal

**Solution:** Scraper runs every 30 minutes and will pick up new PRs automatically.

**Manual sync of specific PR:**
```bash
cd /root/QA-Portal
node scripts/scrape-github-prs.js --pr-number=XXXXX
```

### Scraper Not Running

**Check:**
```bash
./scripts/manage-scraper.sh status
```

**Restart:**
```bash
./scripts/manage-scraper.sh start
```

### Database Connection Issues

**Check:**
```bash
mysql -h 10.0.113.145 -u results -p'P@ssword123' cloudstack_tests -e "SHOW TABLES;"
```

---

## Testing

Run comprehensive test:
```bash
cd /root/QA-Portal

# Test individual PR
node scripts/scrape-github-prs.js --pr-number=12300

# Test state update
node scripts/update-pr-states.js --batch=10

# Test management
./scripts/manage-scraper.sh status

# Health check
/tmp/scraper_health_check.sh
```

---

## Maintenance Tasks

### Daily
- Check logs for errors
- Verify scraper is running

### Weekly
- Check rate limit usage
- Review logs for any issues

### Monthly
- Rotate logs
- Review cron job performance
- Update documentation

---

## Development

### Adding New Features

1. Edit `scrape-github-prs.js`
2. Test with single PR: `node scripts/scrape-github-prs.js --pr-number=XXXX`
3. Check database for changes
4. Test with cron wrapper: `./scripts/scraper-cron.sh`
5. Monitor logs: `tail -f /var/log/cloudstack-pr-scraper.log`

### Database Schema

See database tables:
```sql
-- PR states
SELECT * FROM pr_states LIMIT 5;

-- PR approvals
SELECT * FROM pr_approvals LIMIT 5;

-- Smoke tests
SELECT * FROM pr_smoketests LIMIT 5;

-- Health labels
SELECT * FROM pr_health_labels LIMIT 5;
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Manual scrape | `node scripts/scrape-github-prs.js` |
| Scrape specific PR | `node scripts/scrape-github-prs.js --pr-number=XXXXX` |
| Update states | `node scripts/update-pr-states.js` |
| Check status | `./scripts/manage-scraper.sh status` |
| View logs | `tail -f /var/log/cloudstack-pr-scraper.log` |
| Health check | `/tmp/scraper_health_check.sh` |
| Restart scraper | `./scripts/manage-scraper.sh start` |

---

## Support

For issues or questions:
1. Check logs first
2. Run health check: `/tmp/scraper_health_check.sh`
3. Review this documentation
4. Check TROUBLESHOOTING.md (if exists)

---

**Last Updated:** 2025-12-19
**Version:** 1.0
**Maintainer:** CloudStack QA Team
