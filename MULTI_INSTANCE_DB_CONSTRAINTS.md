# Multi-Instance Database Constraints Analysis

**Date**: 2025-12-30  
**Purpose**: Enable safe multi-instance deployment with proper database constraints

## Current State

The app uses **MySQL with connection pooling** (`mysql2/promise`) which supports concurrent access from multiple instances. However, there are race condition risks during write operations.

## Database Tables & Constraints Needed

### 1. **pr_health_labels** - PR Information & Labels

**Current Usage**: Stores PR metadata and health check labels  
**Writers**: `scrape-github-prs.js`

**Recommended Constraint**:
```sql
ALTER TABLE pr_health_labels
ADD UNIQUE KEY idx_unique_pr_label (pr_number, label_name);
```

**Insert Pattern**:
```javascript
// Current: No duplicate check, relies on manual prevention
INSERT INTO pr_health_labels (pr_number, pr_title, label_name, pr_state) 
VALUES (?, ?, ?, ?)
```

**Should be**:
```javascript
INSERT INTO pr_health_labels (pr_number, pr_title, label_name, pr_state) 
VALUES (?, ?, ?, ?)
ON DUPLICATE KEY UPDATE 
  pr_title = VALUES(pr_title),
  pr_state = VALUES(pr_state),
  updated_at = CURRENT_TIMESTAMP
```

---

### 2. **pr_states** - PR State Tracking

**Current Usage**: Tracks PR open/closed state and assignees  
**Writers**: `scrape-github-prs.js`, `update-pr-states.js`

**Recommended Constraint**:
```sql
ALTER TABLE pr_states
ADD UNIQUE KEY idx_unique_pr (pr_number);
```

**Insert Pattern**:
```javascript
// Already uses ON DUPLICATE KEY UPDATE ✓
INSERT INTO pr_states (pr_number, pr_title, pr_state, assignees, last_checked)
VALUES (?, ?, ?, ?, NOW())
ON DUPLICATE KEY UPDATE 
  pr_title = VALUES(pr_title),
  pr_state = VALUES(pr_state),
  assignees = VALUES(assignees),
  last_checked = NOW()
```

**Status**: ✅ **Already safe** with existing pattern

---

### 3. **pr_approvals** - PR Reviews/Approvals

**Current Usage**: Stores LGTM, APPROVED, CHANGES_REQUESTED, COMMENTED  
**Writers**: `scrape-github-prs.js`

**Recommended Constraint**:
```sql
ALTER TABLE pr_approvals
ADD UNIQUE KEY idx_unique_approval (
  pr_number, 
  approver_login, 
  approval_created_at
);
```

**Insert Pattern**:
```javascript
// Current: No duplicate check or ON DUPLICATE KEY UPDATE
INSERT INTO pr_approvals 
  (pr_number, pr_title, approver_login, approval_state, approval_created_at) 
VALUES (?, ?, ?, ?, ?)
```

**Should be**:
```javascript
INSERT INTO pr_approvals 
  (pr_number, pr_title, approver_login, approval_state, approval_created_at) 
VALUES (?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE 
  approval_state = VALUES(approval_state),
  pr_title = VALUES(pr_title)
```

---

### 4. **pr_codecov_comments** - Code Coverage Data

**Current Usage**: Stores Codecov bot comments and coverage percentages  
**Writers**: `scrape-github-prs.js`

**Recommended Constraint**:
```sql
ALTER TABLE pr_codecov_comments
ADD UNIQUE KEY idx_unique_pr_codecov (pr_number);
```

**Insert Pattern**:
```javascript
// Already uses ON DUPLICATE KEY UPDATE ✓
INSERT INTO pr_codecov_comments 
  (pr_number, pr_title, codecov_comment, codecov_created_at, codecov_present) 
VALUES (?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE 
  codecov_comment = VALUES(codecov_comment), 
  codecov_created_at = VALUES(codecov_created_at), 
  codecov_present = VALUES(codecov_present)
```

**Status**: ✅ **Already safe** with existing pattern

---

### 5. **pr_trillian_comments** - Smoketest Results

**Current Usage**: Stores Trillian bot smoketest results per hypervisor  
**Writers**: `scrape-github-prs.js`

**Recommended Constraint**:
```sql
ALTER TABLE pr_trillian_comments
ADD UNIQUE KEY idx_unique_pr_hypervisor (
  pr_number, 
  hypervisor(50), 
  version(20),
  trillian_created_at
);
```

**Insert Pattern**:
```javascript
// Already uses ON DUPLICATE KEY UPDATE ✓
INSERT INTO pr_trillian_comments 
  (pr_number, pr_title, hypervisor, version, trillian_comment, 
   trillian_created_at, trillian_present, logs_url) 
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE 
  trillian_comment = VALUES(trillian_comment),
  trillian_created_at = VALUES(trillian_created_at),
  trillian_present = VALUES(trillian_present),
  logs_url = VALUES(logs_url)
```

**Status**: ✅ **Already safe** with existing pattern

---

### 6. **test_results** - Detailed Test Failures

**Current Usage**: Stores individual test failures from smoketest runs  
**Writers**: `scrape-github-prs.js` (with application-level duplicate check)

**Recommended Constraint**:
```sql
-- As documented in DUPLICATE_PREVENTION.md
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

**Current Pattern**:
```javascript
// Application-level duplicate check (lines 344-354)
const [existing] = await connection.execute(
  `SELECT id FROM test_results 
   WHERE pr_number = ? AND test_name = ? 
     AND hypervisor <=> ? AND hypervisor_version <=> ?
     AND test_date <=> ?`,
  [prNumber, testName, hypervisor, version, testDate]
);

if (existing.length === 0) {
  INSERT INTO test_results (...) VALUES (...)
}
```

**Should be**:
```javascript
// Remove application check, use constraint + ON DUPLICATE KEY UPDATE
INSERT INTO test_results 
  (pr_number, test_name, test_file, result, time_seconds, 
   hypervisor, hypervisor_version, test_date, logs_url)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE 
  result = VALUES(result),
  time_seconds = VALUES(time_seconds),
  logs_url = VALUES(logs_url)
```

**Status**: ⚠️ **Needs constraint** (cleanup in progress per DUPLICATE_PREVENTION.md)

---

### 7. **flaky_tests_summary** - Aggregated Test Statistics

**Current Usage**: Pre-aggregated statistics for fast queries  
**Writers**: `update-flaky-tests-summary.js` (hourly cron)

**Existing Constraint**: ✅
```sql
UNIQUE KEY idx_unique_test (
  test_name(255), 
  test_file(100), 
  hypervisor(50), 
  hypervisor_version(20)
)
```

**Insert Pattern**:
```javascript
// Proper upsert with aggregation ✓
INSERT INTO flaky_tests_summary (...) VALUES (...)
ON DUPLICATE KEY UPDATE 
  total_runs = ...,
  failure_count = ...,
  ...
```

**Status**: ✅ **Already safe** with constraint

---

### 8. **upgrade_test_results** - Upgrade Test Data

**Current Usage**: Read-only from web app perspective  
**Writers**: External test runners (Jenkins/automation)

**Recommended Constraint**:
```sql
-- Assuming test runs are unique by these fields
ALTER TABLE upgrade_test_results
ADD UNIQUE KEY idx_unique_upgrade_test (
  jenkins_build_number,
  upgrade_start_version(20),
  upgrade_target_version(20),
  management_server_os(50),
  hypervisor(50),
  hypervisor_version(20),
  timestamp_start
);
```

**Status**: ⚠️ **Verify with test automation team** - depends on how tests report results

---

### 9. **test_failures** - Parsed Test Failure Details

**Current Usage**: Stores parsed failure information  
**Writers**: `parse-test-failures.js`

**Recommended Constraint**:
```sql
ALTER TABLE test_failures
ADD UNIQUE KEY idx_unique_failure (
  pr_number,
  test_name(255),
  test_file(100),
  failure_type(50),
  created_at
);
```

**Status**: ⚠️ **Review failure ingestion logic**

---

## Implementation Roadmap

### Phase 1: Immediate (Zero Downtime)
✅ Already done:
- `pr_states` - has ON DUPLICATE KEY UPDATE
- `pr_codecov_comments` - has ON DUPLICATE KEY UPDATE  
- `pr_trillian_comments` - has ON DUPLICATE KEY UPDATE
- `flaky_tests_summary` - has UNIQUE constraint + proper upserts

### Phase 2: Quick Wins (Add constraints to tables without duplicates)
```sql
-- Check for existing duplicates first
SELECT pr_number, COUNT(*) as cnt 
FROM pr_states 
GROUP BY pr_number 
HAVING cnt > 1;

-- If clean, add constraint
ALTER TABLE pr_states 
ADD UNIQUE KEY idx_unique_pr (pr_number);

-- Repeat for pr_codecov_comments
ALTER TABLE pr_codecov_comments
ADD UNIQUE KEY idx_unique_pr_codecov (pr_number);
```

### Phase 3: After Cleanup (test_results)
As per DUPLICATE_PREVENTION.md:
1. Wait for `cleanup-duplicates.js` to finish (daily at 2 AM)
2. Verify no duplicates remain
3. Add UNIQUE constraint
4. Update scraper to use ON DUPLICATE KEY UPDATE
5. Remove application-level duplicate checks

### Phase 4: Review & Add (pr_health_labels, pr_approvals)
```sql
-- Check for duplicates
SELECT pr_number, label_name, COUNT(*) as cnt
FROM pr_health_labels
GROUP BY pr_number, label_name
HAVING cnt > 1;

SELECT pr_number, approver_login, approval_created_at, COUNT(*) as cnt
FROM pr_approvals
GROUP BY pr_number, approver_login, approval_created_at
HAVING cnt > 1;

-- Clean if needed, then add constraints
ALTER TABLE pr_health_labels
ADD UNIQUE KEY idx_unique_pr_label (pr_number, label_name);

ALTER TABLE pr_approvals
ADD UNIQUE KEY idx_unique_approval (
  pr_number, approver_login, approval_created_at
);
```

### Phase 5: Update Scraper Code
Update `scrape-github-prs.js` to use ON DUPLICATE KEY UPDATE instead of application-level checks:

**Lines to update**:
- Line ~750: `pr_health_labels` insert
- Line ~215: `pr_approvals` insert  
- Line ~356-373: `test_results` insert (after constraint added)

---

## Multi-Instance Deployment Strategy

### Safe Now (Read-Heavy Workload)
✅ Multiple web app instances (API server)
- All endpoints are read-only
- Connection pooling handles concurrency
- No race conditions

### Needs Coordination (Write Operations)

#### Option A: Single Scraper Instance (Recommended)
```bash
# Run scrapers on ONLY ONE designated instance
# Instance 1: Web app + scrapers
pm2 start server/dist/index.js --name api-instance-1

# Instance 2+: Web app only (no cron jobs)
pm2 start server/dist/index.js --name api-instance-2
```

#### Option B: Distributed Locks (Advanced)
If you need scrapers on multiple instances:
```javascript
// Use Redis or database-based locking
const lock = await acquireLock('pr-scraper', ttl=600);
if (lock) {
  try {
    await scrapePRs();
  } finally {
    await releaseLock('pr-scraper');
  }
}
```

#### Option C: Database Constraints (After Implementation)
Once all UNIQUE constraints are in place:
- Multiple scrapers can run simultaneously
- Database will prevent duplicates
- Use ON DUPLICATE KEY UPDATE for idempotency
- Add retry logic for constraint violations

---

## Verification Checklist

Before enabling multi-instance writes:

```bash
# 1. Check for duplicate violations
mysql cloudstack_tests -e "
SELECT 'pr_states', pr_number, COUNT(*) as cnt 
FROM pr_states GROUP BY pr_number HAVING cnt > 1
UNION ALL
SELECT 'pr_codecov', pr_number, COUNT(*) 
FROM pr_codecov_comments GROUP BY pr_number HAVING cnt > 1
UNION ALL
SELECT 'pr_health_labels', pr_number, COUNT(*) 
FROM pr_health_labels GROUP BY pr_number, label_name HAVING cnt > 1;
"

# 2. Verify constraints exist
mysql cloudstack_tests -e "
SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = 'cloudstack_tests'
  AND CONSTRAINT_TYPE = 'UNIQUE'
ORDER BY TABLE_NAME;
"

# 3. Test concurrent writes (after constraints)
# Run scraper simultaneously on 2 instances
# Check logs for constraint violations
# Verify no duplicates created
```

---

## Risk Assessment

### Current Risk Level: **MEDIUM** 🟡

**Safe Operations**:
- ✅ Read operations (all API endpoints)
- ✅ Single scraper instance

**Risky Operations**:
- ⚠️ Multiple scraper instances simultaneously
- ⚠️ Concurrent writes to `pr_health_labels`, `pr_approvals`
- ⚠️ Race conditions during PR state updates

### Target Risk Level: **LOW** 🟢 (After Phase 3-4 Complete)

**After Constraints Implemented**:
- ✅ Multiple scrapers safe (with ON DUPLICATE KEY UPDATE)
- ✅ No duplicate data
- ✅ Automatic conflict resolution
- ✅ Retry logic for rare constraint violations

---

## Monitoring Recommendations

Add these queries to monitoring dashboard:

```sql
-- Check for constraint violations in logs
SELECT * FROM mysql.general_log 
WHERE argument LIKE '%Duplicate entry%' 
  AND event_time > NOW() - INTERVAL 1 HOUR;

-- Monitor test_results growth rate
SELECT DATE(created_at) as date, COUNT(*) as new_rows
FROM test_results
WHERE created_at > NOW() - INTERVAL 7 DAY
GROUP BY DATE(created_at);

-- Check for stuck scrapers (no updates in 2 hours)
SELECT table_name, MAX(updated_at) as last_update
FROM (
  SELECT 'pr_states' as table_name, MAX(last_checked) as updated_at FROM pr_states
  UNION ALL
  SELECT 'flaky_tests_summary', MAX(updated_at) FROM flaky_tests_summary
) t
GROUP BY table_name
HAVING last_update < NOW() - INTERVAL 2 HOUR;
```

---

## Summary

**Can you run multiple instances NOW?** 
- ✅ YES for web app (read-only API)
- ⚠️ NO for scrapers (run on one instance only)

**After implementing constraints:**
- ✅ YES for everything (with proper ON DUPLICATE KEY UPDATE patterns)

**Estimated Time to Full Multi-Instance Support:**
- Phase 1: ✅ Done
- Phase 2: 1-2 hours (add constraints to clean tables)
- Phase 3: 24-48 hours (wait for test_results cleanup)
- Phase 4: 2-3 hours (clean + add remaining constraints)
- Phase 5: 1-2 hours (update scraper code)

**Total: ~3-4 days** (mostly waiting for automated cleanup)
