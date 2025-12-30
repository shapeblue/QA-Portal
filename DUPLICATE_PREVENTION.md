# Duplicate Prevention System

## Problem

The `test_results` table was accumulating **millions of duplicate entries** because:
1. No UNIQUE constraint existed in the database
2. The scraper's `ON DUPLICATE KEY UPDATE` clause had no effect without a constraint
3. Each scraper run inserted the same test results again

**Impact**: 6.3M rows with ~80% duplicates, causing:
- Slow queries (40+ seconds)
- Rapid disk space growth (2.7M rows in December alone!)
- Misleading statistics

## Solution

### 1. **Application-Level Prevention** (Primary)

Updated scraper to check for existing entries before inserting:

```javascript
// Check if test result already exists
const [existing] = await connection.execute(
  `SELECT id FROM test_results 
   WHERE pr_number = ? AND test_name = ? 
     AND hypervisor <=> ? AND hypervisor_version <=> ? 
     AND test_date = ?`,
  [prNumber, testName, hypervisor, version, testDate]
);

if (existing.length === 0) {
  // Insert only if doesn't exist
  await connection.execute('INSERT INTO test_results ...');
}
```

**Why this approach?**
- ✅ Works immediately without database migration
- ✅ No risk of constraint violations
- ✅ Handles NULL values correctly (`<=>` operator)
- ✅ Can be deployed without downtime

### 2. **Automated Cleanup** (Secondary)

Daily cron job removes any duplicates that slip through:

```bash
# Runs daily at 2 AM
0 2 * * * /usr/bin/node /root/QA-Portal/scripts/cleanup-duplicates.js
```

**Features**:
- Processes 10,000 duplicates per batch
- Keeps most recent entry (highest ID)
- Non-blocking (small batches with delays)
- Optimizes table after cleanup

### 3. **Database Constraint** (Future)

Once duplicates are cleaned up, add UNIQUE constraint:

```sql
ALTER TABLE test_results 
ADD UNIQUE KEY idx_unique_test (
  pr_number, 
  test_name(255), 
  test_file(100), 
  hypervisor(50), 
  hypervisor_version(20), 
  test_date
);
```

**Note**: Can only be added after cleanup completes.

## Files Modified

### Scraper Updates
- `/root/QA-Portal/scripts/scrape-github-prs.js`
  - Line 342-373: Added duplicate check for Trillian results
  - Line 598-650: Added duplicate check for detailed results

### New Scripts
- `/root/QA-Portal/scripts/cleanup-duplicates.js` - Daily cleanup
- `/root/QA-Portal/scripts/update-flaky-tests-summary.js` - Hourly aggregation

## Monitoring

### Check duplicate count
```bash
mysql -e "SELECT COUNT(*) as total, 
  COUNT(DISTINCT pr_number, test_name, test_file, hypervisor, hypervisor_version, test_date) as unique,
  COUNT(*) - COUNT(DISTINCT pr_number, test_name, test_file, hypervisor, hypervisor_version, test_date) as duplicates
FROM test_results;" cloudstack_tests
```

### Check cleanup log
```bash
tail -f /var/log/cleanup-duplicates.log
```

### Check scraper behavior
```bash
# Should show "already exists" skips instead of inserts
tail -f /var/log/cloudstack-pr-scraper.log
```

## Expected Results

### Before Fix
- 6.3M rows (80% duplicates)
- 1.3 GB disk space
- 40-120 second queries
- Growing at 2.7M rows/month

### After Fix
- ~1.2M unique rows (estimated)
- ~0.3 GB disk space
- 0.05-0.2 second queries
- Growing at ~150K rows/month (normal rate)

### Timeline
- **Immediate**: Scraper stops creating new duplicates
- **24-48 hours**: Cleanup script removes existing duplicates
- **After cleanup**: Can add UNIQUE constraint for database-level enforcement

## Benefits

✅ **No downtime required**
✅ **Works with existing data**
✅ **Handles NULL values correctly**
✅ **Automatic daily cleanup**
✅ **Gradual cleanup (non-blocking)**
✅ **Can add DB constraint later**

## Future Optimization

Once cleanup completes and UNIQUE constraint is added:
1. Remove application-level checks (constraint will handle it)
2. Use `INSERT ... ON DUPLICATE KEY UPDATE` efficiently
3. Disable daily cleanup job (no longer needed)
