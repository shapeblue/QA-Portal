# Available Packages Feature - Deployment Guide

**Feature:** Display package build status from BlueOrangutan bot  
**Status:** ✅ Ready for Deployment  
**Date:** 2026-01-19  
**Branch:** `feature/available-packages`

---

## 🎯 Pre-Deployment Checklist

### Code Complete
- [x] Phase 0: QA issues addressed
- [x] Phase 1: Backend implementation
- [x] Phase 2: Frontend implementation
- [x] All files committed to Git

### Files Created/Modified
- [x] Database migration script
- [x] Validation utilities
- [x] Parser module
- [x] Backfill script
- [x] Backend API (server/src/index.ts)
- [x] Frontend types (client/src/types/index.ts)
- [x] UI component (client/src/components/AllPRsView.tsx)
- [x] CSS styles (client/src/components/AllPRsView.css)

---

## 🚀 Deployment Steps

### Step 1: Database Migration (5 minutes)

**On Production Server:**

```bash
# SSH to production
ssh root@10.0.113.145

# Navigate to project
cd /root/QA-Portal

# Check database credentials
cat server/.env | grep DB_

# Run migration
mysql -u results -p cloudstack_tests < scripts/migrations/001_add_package_builds_table.sql

# Verify table created
mysql -u results -p cloudstack_tests -e "SHOW TABLES LIKE 'pr_package_builds';"
mysql -u results -p cloudstack_tests -e "DESCRIBE pr_package_builds;"
```

**Expected Output:**
```
+--------------------+
| Tables_in_cloudstack_tests (pr_package_builds) |
+--------------------+
| pr_package_builds  |
+--------------------+

Table structure with columns:
- id, pr_number, pr_title
- packages (JSON)
- sl_jid, build_url, build_status
- comment_created_at, comment_id
- head_commit_sha, head_commit_date
- is_stale
- inserted_at, updated_at
```

---

### Step 2: Deploy Code (10 minutes)

**Checkout and merge feature branch:**

```bash
# On production server
cd /root/QA-Portal

# Check current branch
git branch

# Fetch latest
git fetch origin

# Checkout feature branch
git checkout feature/available-packages

# Pull latest changes
git pull origin feature/available-packages --rebase

# Verify files exist
ls -la scripts/lib/blueorangutan-parser.js
ls -la scripts/lib/package-validation.js
ls -la scripts/backfill-package-builds.js
```

**Build frontend and backend:**

```bash
# Install dependencies (if needed)
npm install
cd client && npm install && cd ..

# Build client
cd client
npm run build
cd ..

# Build server (TypeScript compilation)
cd server
npm run build
cd ..

# Verify builds
ls -la client/build/
ls -la server/dist/index.js
```

---

### Step 3: Restart Backend Server (2 minutes)

**CRITICAL: Kill old process explicitly (lesson from milestone deployment)**

```bash
# Find Node.js process
ps aux | grep "node.*server/dist/index.js"

# Note the PID, then kill it
kill <PID>

# Verify process stopped
ps aux | grep "node.*server/dist/index.js"

# Start new server
cd /root/QA-Portal
nohup node server/dist/index.js > /tmp/qa-server.log 2>&1 &

# Verify new process started
ps aux | grep "node.*server/dist/index.js"

# Check logs
tail -20 /tmp/qa-server.log

# Verify process timestamp is AFTER build time
ps -p <NEW_PID> -o lstart=
ls -lh server/dist/index.js
```

---

### Step 4: Backfill Package Data (15-20 minutes)

**Run backfill script to populate existing PRs:**

```bash
cd /root/QA-Portal

# Dry run first (see what would happen)
node scripts/backfill-package-builds.js

# Check output, should show:
# - GitHub API rate limit status
# - List of PRs to process
# - What packages would be inserted

# If dry run looks good, execute
node scripts/backfill-package-builds.js --execute

# Monitor progress
# Script will show:
# - PR #XXXX: ✅ Found packages: el8, el9 (SL-JID 12345)
# - PR #YYYY: ⚪ No package builds found
# - Summary statistics at end
```

**Expected Results:**
- ~226 open PRs processed
- ~50-100 PRs with package builds found (varies)
- No errors (validation prevents bad data)

---

### Step 5: Verify Deployment (5 minutes)

#### Test API Endpoint

```bash
# Test API returns packageBuilds
curl -s http://localhost:5001/api/all-open-prs | jq '.[0]' | grep -A 10 packageBuilds

# Should see:
# "packageBuilds": {
#   "packages": ["el8", "el9"],
#   "slJid": 12345,
#   "buildUrl": "https://...",
#   "buildStatus": "success",
#   "isStale": false,
#   "buildDate": "2026-01-19T..."
# }
```

#### Test Database

```bash
# Check package builds stored
mysql -u results -p cloudstack_tests -e "SELECT COUNT(*) FROM pr_package_builds;"

# Check sample data
mysql -u results -p cloudstack_tests -e "
SELECT pr_number, packages, sl_jid, build_status, is_stale 
FROM pr_package_builds 
LIMIT 5;
"
```

#### Test Frontend

```bash
# Open browser and navigate to:
# http://10.0.113.145

# 1. Go to "All Open PRs" tab
# 2. Look for "Available Packages" column (after Milestone)
# 3. Should see package badges:
#    - Green badges: Fresh packages
#    - Orange badges: Stale packages
#    - Red badges: Failed builds
# 4. Hover over badge - should show tooltip with details
# 5. Click badge - should open Jenkins build logs
```

---

## 🧪 Testing Checklist

### Functional Tests

- [ ] API endpoint returns packageBuilds field
- [ ] Package badges display in UI
- [ ] Green badges for fresh packages
- [ ] Orange badges for stale packages
- [ ] Red badges for failed packages
- [ ] Tooltips show build date, SL-JID, status
- [ ] Clicking badge opens build URL
- [ ] PRs without packages show "—"
- [ ] Multiple packages display correctly

### Edge Cases

- [ ] PR with no package builds (shows "—")
- [ ] PR with stale packages (orange badges)
- [ ] PR with failed packages (red badges with ! prefix)
- [ ] PR with many packages (wraps correctly)
- [ ] Mobile view (responsive design works)

### Performance

- [ ] Page loads in < 2 seconds
- [ ] No console errors (F12 Developer Tools)
- [ ] API response time acceptable (~500ms)
- [ ] Database queries efficient

---

## 📊 Monitoring

### Metrics to Watch

**Database:**
```sql
-- Total package builds
SELECT COUNT(*) FROM pr_package_builds;

-- Fresh vs stale
SELECT 
  SUM(CASE WHEN is_stale = 0 THEN 1 ELSE 0 END) as fresh,
  SUM(CASE WHEN is_stale = 1 THEN 1 ELSE 0 END) as stale
FROM pr_package_builds;

-- Build status distribution
SELECT build_status, COUNT(*) 
FROM pr_package_builds 
GROUP BY build_status;
```

**Logs:**
```bash
# Check server logs for errors
tail -100 /tmp/qa-server.log | grep -i error

# Check for parser failures
grep "Failed to parse" /tmp/qa-server.log

# Check for validation errors
grep "Validation failed" /tmp/qa-server.log
```

---

## 🔄 Post-Deployment

### Update Scraper (Optional - if not already integrated)

The scraper needs to be updated to parse package builds going forward.
This is separate from the backfill and can be done later.

**File to update:** `scripts/scrape-github-prs.js`

**Changes needed:**
1. Import parser: `const { parseLatestPackageBuild } = require('./lib/blueorangutan-parser');`
2. Fetch PR comments
3. Parse package builds
4. Store in database

---

## ❌ Rollback Plan

If issues arise, follow this rollback procedure:

### Quick Rollback (5 minutes)

```bash
# SSH to production
ssh root@10.0.113.145
cd /root/QA-Portal

# Checkout previous branch
git checkout main  # or previous stable branch
git pull origin main --rebase

# Rebuild
npm run build
cd client && npm run build && cd ..
cd server && npm run build && cd ..

# Restart server
ps aux | grep "node.*server/dist/index.js"
kill <PID>
nohup node server/dist/index.js > /tmp/qa-server.log 2>&1 &

# Verify
curl -s http://localhost:5001/api/health
```

### Database Rollback (if needed)

```bash
# Drop table (will lose package build data)
mysql -u results -p cloudstack_tests -e "DROP TABLE IF EXISTS pr_package_builds;"

# Verify
mysql -u results -p cloudstack_tests -e "SHOW TABLES;"
```

**Note:** Frontend will gracefully handle missing packageBuilds data.

---

## 📝 Documentation Updates

After successful deployment, update:

- [ ] README.md - Add "Available Packages" to features list
- [ ] .copilot - Update with deployment date
- [ ] CONTEXT_PROMPT.md - Mark feature as deployed

---

## 🎓 Lessons from Previous Deployments

Based on milestone feature deployment (2026-01-15):

1. **Always kill old server process explicitly**
   - Use specific PID, not pattern matching
   - Verify process timestamp after restart

2. **Test API directly after deployment**
   - Don't rely on UI alone (could be cached)
   - `curl` + `jq` for quick verification

3. **Check process timestamps vs build time**
   - Ensure server started AFTER build completed
   - `ps -p <PID> -o lstart=` vs `ls -lh server/dist/index.js`

4. **Hard refresh browser**
   - Ctrl+Shift+R or Cmd+Shift+R
   - Clear cache if needed

---

## ✅ Success Criteria

Deployment is successful when:

- [x] Database table exists and has data
- [x] API returns packageBuilds for PRs
- [x] UI displays package badges
- [x] Badges are color-coded correctly
- [x] Tooltips show correct information
- [x] No console errors
- [x] Page load time acceptable
- [x] Mobile view works
- [x] No 500 errors in logs

---

## 🆘 Troubleshooting

### Issue: "Table doesn't exist" error

**Solution:**
```bash
mysql -u results -p cloudstack_tests < scripts/migrations/001_add_package_builds_table.sql
```

### Issue: Packages not showing in UI

**Diagnosis:**
```bash
# Check API
curl -s http://localhost:5001/api/all-open-prs | jq '.[0].packageBuilds'

# If null, check database
mysql -u results -p cloudstack_tests -e "SELECT * FROM pr_package_builds LIMIT 1;"

# If empty, run backfill
node scripts/backfill-package-builds.js --execute
```

### Issue: Stale server process

**Solution:**
```bash
ps aux | grep node
kill <OLD_PID>
nohup node server/dist/index.js > /tmp/qa-server.log 2>&1 &
```

### Issue: Parser errors in logs

**Check logs:**
```bash
grep "Failed to parse" /tmp/qa-server.log
```

**If format changed:**
- Update parser in `scripts/lib/blueorangutan-parser.js`
- Add new parseV4() function
- Redeploy

---

## 📞 Support

If issues persist:

1. Check logs: `/tmp/qa-server.log`
2. Check database: `mysql -u results -p cloudstack_tests`
3. Review this guide
4. Check QA review document: `docs/AVAILABLE_PACKAGES_PLAN_QA_REVIEW.md`
5. Check implementation status: `docs/AVAILABLE_PACKAGES_IMPLEMENTATION.md`

---

**Deployment Date:** _____________  
**Deployed By:** _____________  
**Status:** _____________  
**Notes:** _____________
