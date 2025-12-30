# Flaky Tests Summary System

## Overview

The flaky tests feature uses a **pre-aggregated summary table** for instant query performance.

## Architecture

### Tables
- **`test_results`**: Raw test data (5.2M+ rows)
- **`flaky_tests_summary`**: Pre-aggregated flaky test statistics (updated hourly)

### Performance
- **Before**: 40-120 seconds (complex aggregation on 5M rows)
- **After**: 0.05-0.2 seconds (simple query on pre-aggregated data)

## How It Works

1. **Hourly Update**: Cron job runs every hour to aggregate test results from the last month
2. **Fast Queries**: API queries the small summary table instead of the huge raw table
3. **Data Freshness**: Data is never more than 1 hour old

## Components

### Summary Table Script
- **Location**: `/root/QA-Portal/scripts/update-flaky-tests-summary.js`
- **Schedule**: Every hour at minute 0 (via cron)
- **Log**: `/var/log/flaky-tests-summary.log`

### Cron Job
```bash
0 * * * * /usr/bin/node /root/QA-Portal/scripts/update-flaky-tests-summary.js >> /var/log/flaky-tests-summary.log 2>&1
```

## Manual Updates

To manually update the summary table:
```bash
/usr/bin/node /root/QA-Portal/scripts/update-flaky-tests-summary.js
```

## Monitoring

Check the update log:
```bash
tail -f /var/log/flaky-tests-summary.log
```

Check cron status:
```bash
crontab -l | grep flaky
```

## Database Schema

```sql
CREATE TABLE flaky_tests_summary (
  id INT AUTO_INCREMENT PRIMARY KEY,
  test_name VARCHAR(500) NOT NULL,
  test_file VARCHAR(255),
  hypervisor VARCHAR(100),
  hypervisor_version VARCHAR(50),
  total_runs INT DEFAULT 0,
  failure_count INT DEFAULT 0,
  success_count INT DEFAULT 0,
  error_count INT DEFAULT 0,
  last_failure_date DATETIME,
  last_success_date DATETIME,
  last_run_date DATETIME,
  pr_numbers TEXT,
  last_failure_log_url VARCHAR(500),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_unique_test (test_name(255), test_file(100), hypervisor(50), hypervisor_version(20)),
  KEY idx_failure_count (failure_count),
  KEY idx_last_failure (last_failure_date)
);
```

## Troubleshooting

### Summary table is empty
Run the update script manually to populate it.

### Old data showing
Wait for the next hourly update, or run the script manually.

### Script failing
Check the log file for error messages and verify database connectivity.

## Benefits

✅ **200x faster** query performance (40s → 0.2s)
✅ **No caching complexity** - direct database queries
✅ **Always fresh data** - updated every hour
✅ **Reliable** - no cache expiration issues
✅ **Scalable** - performance stays constant as data grows
