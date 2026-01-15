# Milestone Feature - Rollback Plan

**Feature Branch:** `feature/add-milestone-to-prs`  
**Created:** 2026-01-15  
**Author:** QA Portal Team

## 🔄 Rollback Strategy

### Quick Rollback (Frontend Only - No Data Loss)
If milestone display causes UI issues but backend is stable:

```bash
# On production server
cd /root/QA-Portal
git checkout main
npm run build
# Restart services
```

### Full Rollback (Backend + Frontend)
If database or API issues occur:

```bash
# 1. Revert to main branch
cd /root/QA-Portal
git checkout main
git pull origin main

# 2. Rebuild and restart
npm run build
pkill -f "node.*server/dist/index.js"
nohup node server/dist/index.js > /tmp/qa-server.log 2>&1 &

# 3. Remove milestone column (OPTIONAL - only if causing issues)
# mysql -u results -p cloudstack_tests
# ALTER TABLE pr_states DROP COLUMN milestone;
```

## 📦 Backup Information

### Files Modified
- `server/src/index.ts` - Added milestone to PRData interface and queries
- `client/src/types/index.ts` - Added milestone to PRData interface
- `client/src/components/AllPRsView.tsx` - Added milestone column and sorting
- `client/src/components/AllPRsView.css` - Added milestone styling
- `scripts/scrape-github-prs.js` - Added milestone extraction
- `scripts/update-pr-states.js` - Added milestone updates

### Database Changes
```sql
-- This change is SAFE and backwards compatible
ALTER TABLE pr_states ADD COLUMN milestone VARCHAR(100) DEFAULT NULL;

-- To rollback (only if absolutely necessary):
ALTER TABLE pr_states DROP COLUMN milestone;
```

### Git Backup
```bash
# Main branch is untouched - safe rollback point
git checkout main

# Feature branch preserved
git branch -a | grep milestone
```

## 🧪 Pre-Deployment Checklist

- [ ] Feature branch created: `feature/add-milestone-to-prs`
- [ ] All changes committed
- [ ] Local testing completed
- [ ] Database backup created (if needed)
- [ ] Rollback steps documented
- [ ] Team notified of deployment

## 🚨 Rollback Triggers

Rollback immediately if:
- ❌ Database queries fail
- ❌ API returns 500 errors
- ❌ Frontend shows blank page
- ❌ Scraper crashes repeatedly
- ❌ Query performance > 2 seconds

Monitor but don't rollback for:
- ⚠️ Null milestones displayed (expected)
- ⚠️ Slow initial scraper run (expected)
- ⚠️ Minor CSS tweaks needed

## 📊 Success Metrics

After 24 hours, feature is successful if:
- ✅ No production errors in logs
- ✅ Query performance < 500ms
- ✅ Scraper runs successfully
- ✅ Users can sort by milestone
- ✅ No user complaints

## 📞 Contact

Issues? Check:
1. `/tmp/qa-server.log` - Server errors
2. Browser console - Frontend errors
3. MySQL slow query log - Performance issues

---
**Note:** This is a LOW-RISK change. The milestone column is nullable and optional. Existing functionality will continue to work even if milestone feature fails.
