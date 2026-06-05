# Milestone Feature Deployment Guide

**Feature:** Milestone column in All Open PRs page  
**Branch:** `feature/add-milestone-to-prs`  
**Date:** 2026-01-15  
**Risk Level:** 🟡 LOW-MEDIUM

---

## Pre-Deployment Checklist

- [x] Feature branch created
- [x] All code changes committed
- [x] Rollback plan documented (MILESTONE_ROLLBACK_PLAN.md)
- [ ] Database backup created (production)
- [ ] Team notified
- [ ] Deployment window scheduled

---

## Deployment Steps

### Phase 0: Database Schema Update (5 minutes)

**IMPORTANT:** This must be done FIRST before deploying code!

```bash
# On production server (root@10.0.113.145)
ssh root@10.0.113.145

# Connect to MySQL
mysql -u results -p cloudstack_tests

# Add milestone column (SAFE - backwards compatible)
ALTER TABLE pr_states ADD COLUMN milestone VARCHAR(100) DEFAULT NULL;

# Verify column was added
SHOW COLUMNS FROM pr_states LIKE 'milestone';

# Exit MySQL
exit
```

**Expected output:**
```
+----------+--------------+------+-----+---------+-------+
| Field    | Type         | Null | Key | Default | Extra |
+----------+--------------+------+-----+---------+-------+
| milestone| varchar(100) | YES  |     | NULL    |       |
+----------+--------------+------+-----+---------+-------+
```

### Phase 1: Backfill Existing PRs (20-30 minutes)

**IMPORTANT:** This populates milestone data for ALL existing open PRs (~220 PRs).

```bash
# Still on production server
cd /root/QA-Portal

# First, do a DRY RUN to preview changes and check rate limit
node scripts/backfill-milestones.js

# Review the output:
# - Shows total PRs to process (~220)
# - Checks GitHub API rate limit (needs ~220 requests)
# - Preview first few PRs

# If looks good and you have enough rate limit, execute for real:
node scripts/backfill-milestones.js --execute

# Monitor progress - will process ALL open PRs
# Expected: Some PRs will have milestones, some won't (both are OK)
# Time: ~220 PRs * 0.2 seconds/PR = ~44 seconds + API delays = ~5-10 minutes
```

**If you hit rate limit:**
```bash
# Process what you can with remaining rate limit
node scripts/backfill-milestones.js --execute --force-partial

# Then wait for rate limit reset and run again
# Already processed PRs will be skipped automatically
```

**Sample output:**
```
🔄 Milestone Backfill Script
Mode: ✍️  EXECUTE (will update database)
Token: ✅ Set

📊 GitHub API Rate Limit:
   Remaining: 4850 requests
   Resets at: 1/15/2026, 1:30:00 PM

Total open PRs to process: 220

✅ milestone column exists in pr_states table

Found 220 open PRs to process

PR #12431: ✅ Found milestone: 4.20.3
PR #12430: ⚪ No milestone
PR #12428: ✅ Found milestone: 4.20.3
...
(processes all 220 PRs)
...

============================================================
📊 Summary:
============================================================
Total PRs processed:     220
PRs with milestone:      65
PRs without milestone:   155
Errors:                  0

✅ Updated 220 PRs in database.
```

### Phase 2: Deploy Code Changes (5 minutes)

```bash
# Make sure you're on production server
cd /root/QA-Portal

# Pull latest changes
git fetch origin
git checkout feature/add-milestone-to-prs
git pull origin feature/add-milestone-to-prs

# Install dependencies (in case backfill script needs new ones)
npm install

# Build client and server
npm run build

# Restart backend service
pkill -f "node.*server/dist/index.js"
nohup node server/dist/index.js > /tmp/qa-server.log 2>&1 &

# Verify server started
ps aux | grep node
tail -20 /tmp/qa-server.log
```

**Expected log output:**
```
Database connection pool created
Server is running on port 5001
```

### Phase 3: Verification (5 minutes)

1. **Check API endpoint:**
```bash
curl -s http://localhost:5001/api/all-open-prs | jq '.[0] | {number, milestone}'
```

**Expected:** Should see milestone field (either with value or null)

2. **Check frontend:**
- Open browser: http://10.0.113.145 or http://qa.portal.url
- Navigate to "📋 All Open PRs" tab
- Verify:
  - ✅ Milestone column appears after "Assignee"
  - ✅ Some PRs show milestone badges (🎯 4.20.3, etc.)
  - ✅ Some PRs show "—" (no milestone)
  - ✅ Clicking "Milestone" header sorts the table
  - ✅ No console errors in browser dev tools

3. **Check logs for errors:**
```bash
tail -50 /tmp/qa-server.log | grep -i error
# Should return nothing or only old errors
```

### Phase 4: Future Scraper Runs

The milestone will now be automatically updated by the regular scraper runs:

```bash
# Scrapers already run via cron, but you can test manually:
cd /root/QA-Portal
node scripts/scrape-github-prs.js --pr-number=12431

# Should see:
# Processing PR #12431...
#   Title: [PR title]
#   State: open
#   Assignees: user1, user2
#   Milestone: 4.20.3  <-- NEW!
```

---

## Post-Deployment Monitoring

### First 24 Hours

Monitor these metrics:

1. **Server logs:**
```bash
tail -f /tmp/qa-server.log | grep -i "error\|milestone"
```

2. **Query performance:**
```bash
# Connect to MySQL
mysql -u results -p cloudstack_tests

# Check slow queries
SELECT * FROM information_schema.processlist WHERE time > 2;

# Should be empty or very few results
```

3. **User feedback:**
   - Check if users report any issues
   - Verify milestone data is accurate
   - Ensure sorting works correctly

### Success Metrics

After 24 hours, verify:
- ✅ No production errors in logs
- ✅ API response time < 500ms
- ✅ Scraper runs successfully
- ✅ Milestone data is up-to-date
- ✅ No user complaints

---

## Rollback Procedure

If issues occur, follow the rollback plan in `MILESTONE_ROLLBACK_PLAN.md`:

**Quick rollback (frontend only):**
```bash
cd /root/QA-Portal
git checkout main
npm run build
pkill -f "node.*server/dist/index.js"
nohup node server/dist/index.js > /tmp/qa-server.log 2>&1 &
```

**Full rollback (remove column - ONLY if absolutely necessary):**
```bash
mysql -u results -p cloudstack_tests
ALTER TABLE pr_states DROP COLUMN milestone;
```

---

## Testing Checklist

### Manual Testing

- [ ] All PRs page loads without errors
- [ ] Milestone column is visible
- [ ] Milestone badges display correctly
- [ ] Sorting by milestone works
- [ ] PRs without milestone show "—"
- [ ] Hover tooltip on milestone shows full text
- [ ] No console errors in browser
- [ ] Mobile view works (if applicable)
- [ ] API returns milestone field
- [ ] Scraper updates milestone correctly

### Edge Cases Tested

- [ ] PR with very long milestone name (e.g., "4.20.0-RC1-hotfix")
- [ ] PR with milestone removed after sync
- [ ] NULL milestone in database
- [ ] Sort with mixed null/non-null milestones
- [ ] Performance with 200+ PRs displayed

---

## Notes

- **Backwards Compatible:** The milestone column is nullable and optional
- **No Breaking Changes:** Existing functionality continues to work
- **Safe to Rollback:** Just switch back to main branch
- **Data Loss:** None - milestone data persists even after rollback

---

## Troubleshooting

### Issue: Milestone column not showing

**Solution:**
1. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
2. Clear browser cache
3. Check if build completed: `ls -la client/build/`

### Issue: All milestones show "—"

**Solution:**
1. Check if backfill ran: `mysql -u results -p cloudstack_tests -e "SELECT COUNT(*) FROM pr_states WHERE milestone IS NOT NULL"`
2. Re-run backfill: `node scripts/backfill-milestones.js --execute --force`

### Issue: API returns 500 error

**Solution:**
1. Check logs: `tail -50 /tmp/qa-server.log`
2. Verify column exists: `mysql -u results -p cloudstack_tests -e "SHOW COLUMNS FROM pr_states LIKE 'milestone'"`
3. Restart server

### Issue: Sorting by milestone breaks

**Solution:**
1. Check browser console for JS errors
2. Verify TypeScript compiled: `ls -la server/dist/`
3. Hard refresh browser

---

## Contact

Issues? Questions?
- Check logs: `/tmp/qa-server.log`
- Check database: `mysql -u results -p cloudstack_tests`
- Rollback if needed: See `MILESTONE_ROLLBACK_PLAN.md`

---

**Deployment completed by:** _________________  
**Date/Time:** _________________  
**Status:** [ ] Success [ ] Partial [ ] Rolled Back  
**Notes:** _________________
