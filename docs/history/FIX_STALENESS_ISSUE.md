# Fix for Package Build Staleness Not Updating

## Problem
PR #12032 shows packages as FRESH but they should be STALE because:
- Last package build: 2026-01-07 09:11:52Z (SL-JID 16279)
- Latest commit: 2026-01-07 09:14:16Z (3 minutes later)

The staleness calculation is correct in `backfill-package-builds.js`,
but the data is stale because:

1. `backfill-package-builds.js` is a one-time script, not automatic
2. `scrape-github-prs.js` doesn't update package build data
3. No cron job or periodic sync exists to refresh staleness

## Root Cause
The `pr_package_builds` table stores `head_commit_date` and `is_stale` 
at the time of backfill, but when new commits are pushed, this data 
becomes outdated.

## Solution Options

### Option A: Add Package Build Updates to Main Scraper (RECOMMENDED)
Integrate package build checking into `scrape-github-prs.js` so it runs 
automatically with every PR sync.

**Pros:**
- Automatic, no manual intervention
- Real-time staleness detection
- Uses existing infrastructure

**Cons:**
- Slightly increases scrape time
- Need to be careful with GitHub API rate limits

### Option B: Create Cron Job for Backfill Script
Run `backfill-package-builds.js` periodically (e.g., hourly).

**Pros:**
- Simple, uses existing script
- Separation of concerns

**Cons:**
- Requires server cron setup
- Staleness may be up to 1 hour outdated
- Duplicate API calls

### Option C: Update Staleness on-the-fly in API
Calculate staleness when serving `/api/prs-open` by comparing stored 
`head_commit_date` with current PR HEAD.

**Pros:**
- Always accurate
- No additional scraping needed

**Cons:**
- Adds complexity to API response
- Requires fetching PR HEAD for each request (slow, rate limit issues)

## Recommended Implementation: Option A

Add package build processing to `scrape-github-prs.js` within the
`processPR()` function, similar to how it handles reviews, comments,
and test results.

### Changes Needed:

1. Import blueorangutan parser in `scrape-github-prs.js`:
   ```javascript
   const { parseLatestPackageBuild } = require('./lib/blueorangutan-parser');
   ```

2. Add package build storage function:
   ```javascript
   async function storePackageBuildFromScrape(connection, prNumber, prTitle, pr, comments) {
     const packageBuild = parseLatestPackageBuild(comments, pr);
     if (!packageBuild) return;
     
     // Same logic as backfill script
     const packagesJson = JSON.stringify(packageBuild.packages);
     const commentCreatedAt = new Date(packageBuild.createdAt);
     const headCommitDate = packageBuild.headCommitDate ? new Date(packageBuild.headCommitDate) : null;
     const isStale = headCommitDate && commentCreatedAt < headCommitDate;
     
     await connection.execute(
       `INSERT INTO pr_package_builds 
         (pr_number, pr_title, packages, sl_jid, build_url, build_status,
          comment_created_at, comment_id, head_commit_sha, head_commit_date, is_stale) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          packages = VALUES(packages),
          sl_jid = VALUES(sl_jid),
          build_url = VALUES(build_url),
          build_status = VALUES(build_status),
          comment_created_at = VALUES(comment_created_at),
          head_commit_sha = VALUES(head_commit_sha),
          head_commit_date = VALUES(head_commit_date),
          is_stale = VALUES(is_stale)`,
       [prNumber, prTitle, packagesJson, packageBuild.slJid,
        packageBuild.buildUrl, packageBuild.buildStatus,
        commentCreatedAt, packageBuild.commentId,
        packageBuild.headCommitSha, headCommitDate, isStale]
     );
   }
   ```

3. Call it in `processPR()` after fetching comments:
   ```javascript
   await storePackageBuildFromScrape(connection, prNumber, prTitle, pr, comments);
   ```

This ensures package build staleness is updated every time PRs are scraped.

## Quick Fix for Production

Until the permanent fix is deployed, manually run:
```bash
cd /path/to/QA-Portal
GITHUB_TOKEN=your_token node scripts/backfill-package-builds.js --execute
```

Then restart the server to see updated data.
