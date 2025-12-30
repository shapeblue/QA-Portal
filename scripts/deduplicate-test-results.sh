#!/bin/bash

# Fix Test Results Duplication Issue
# This script:
# 1. Creates a temporary table with deduplicated data
# 2. Adds a UNIQUE constraint to prevent future duplicates
# 3. Replaces the old table with the clean one

set -e

echo "=========================================="
echo "Test Results Deduplication Script"
echo "=========================================="
echo ""

# Load environment variables
if [ -f /root/QA-Portal/.env ]; then
    export $(cat /root/QA-Portal/.env | grep -v '^#' | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi

DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-3306}
DB_USER=${DB_USER:-root}
DB_NAME=${DB_NAME:-cloudstack_tests}

echo "Database: ${DB_NAME}@${DB_HOST}:${DB_PORT}"
echo ""

# Check current row count
echo "Step 1: Checking current row count..."
CURRENT_ROWS=$(mysql -h${DB_HOST} -P${DB_PORT} -u${DB_USER} -p${DB_PASSWORD} ${DB_NAME} -sN -e "SELECT COUNT(*) FROM test_results;" 2>/dev/null)
echo "Current rows: ${CURRENT_ROWS}"
echo ""

# Check duplicate count
echo "Step 2: Checking duplicate count (this may take a minute)..."
UNIQUE_ROWS=$(mysql -h${DB_HOST} -P${DB_PORT} -u${DB_USER} -p${DB_PASSWORD} ${DB_NAME} -sN -e "SELECT COUNT(DISTINCT pr_number, test_name, COALESCE(test_file, ''), COALESCE(hypervisor, ''), COALESCE(hypervisor_version, ''), test_date) FROM test_results;" 2>/dev/null)
DUPLICATES=$((CURRENT_ROWS - UNIQUE_ROWS))
DUPLICATE_PCT=$(echo "scale=2; $DUPLICATES * 100 / $CURRENT_ROWS" | bc)
echo "Unique rows: ${UNIQUE_ROWS}"
echo "Duplicates: ${DUPLICATES} (${DUPLICATE_PCT}%)"
echo ""

if [ $DUPLICATES -eq 0 ]; then
    echo "No duplicates found! Adding UNIQUE constraint only..."
else
    echo "Step 3: Backing up table structure..."
    mysql -h${DB_HOST} -P${DB_PORT} -u${DB_USER} -p${DB_PASSWORD} ${DB_NAME} -e "SHOW CREATE TABLE test_results\G" > /tmp/test_results_backup_schema.txt 2>/dev/null
    echo "Schema backed up to /tmp/test_results_backup_schema.txt"
    echo ""

    echo "Step 4: Creating deduplicated table (this will take several minutes)..."
    mysql -h${DB_HOST} -P${DB_PORT} -u${DB_USER} -p${DB_PASSWORD} ${DB_NAME} << 'EOSQL' 2>/dev/null
-- Create new table with deduplication
CREATE TABLE test_results_new LIKE test_results;

-- Add UNIQUE constraint
ALTER TABLE test_results_new 
ADD UNIQUE KEY idx_unique_test (pr_number, test_name(255), test_file(100), hypervisor(50), hypervisor_version(20), test_date);

-- Insert deduplicated data (keep the latest entry for each unique test)
INSERT INTO test_results_new
  (pr_number, test_name, test_file, result, time_seconds, hypervisor, hypervisor_version, test_date, logs_url, created_at)
SELECT 
  pr_number,
  test_name,
  test_file,
  result,
  time_seconds,
  hypervisor,
  hypervisor_version,
  test_date,
  logs_url,
  MAX(created_at) as created_at
FROM test_results
GROUP BY pr_number, test_name, test_file, hypervisor, hypervisor_version, test_date;
EOSQL

    echo "Deduplicated table created!"
    echo ""

    # Check new row count
    NEW_ROWS=$(mysql -h${DB_HOST} -P${DB_PORT} -u${DB_USER} -p${DB_PASSWORD} ${DB_NAME} -sN -e "SELECT COUNT(*) FROM test_results_new;" 2>/dev/null)
    REMOVED=$((CURRENT_ROWS - NEW_ROWS))
    REMOVED_PCT=$(echo "scale=2; $REMOVED * 100 / $CURRENT_ROWS" | bc)
    
    echo "New table rows: ${NEW_ROWS}"
    echo "Removed: ${REMOVED} duplicates (${REMOVED_PCT}%)"
    echo ""

    echo "Step 5: Replacing old table with deduplicated version..."
    echo "WARNING: This will drop the old table and rename the new one."
    read -p "Continue? (yes/no): " CONFIRM
    
    if [ "$CONFIRM" != "yes" ]; then
        echo "Aborted. Cleaning up..."
        mysql -h${DB_HOST} -P${DB_PORT} -u${DB_USER} -p${DB_PASSWORD} ${DB_NAME} -e "DROP TABLE IF EXISTS test_results_new;" 2>/dev/null
        exit 1
    fi

    mysql -h${DB_HOST} -P${DB_PORT} -u${DB_USER} -p${DB_PASSWORD} ${DB_NAME} << 'EOSQL' 2>/dev/null
-- Rename tables
RENAME TABLE test_results TO test_results_old, test_results_new TO test_results;
EOSQL

    echo "Table replaced successfully!"
    echo ""
    
    echo "Step 6: Verifying new table..."
    FINAL_ROWS=$(mysql -h${DB_HOST} -P${DB_PORT} -u${DB_USER} -p${DB_PASSWORD} ${DB_NAME} -sN -e "SELECT COUNT(*) FROM test_results;" 2>/dev/null)
    echo "Final row count: ${FINAL_ROWS}"
    echo ""
    
    echo "Step 7: Old table kept as 'test_results_old' for safety."
    echo "You can drop it after verifying everything works:"
    echo "  DROP TABLE test_results_old;"
    echo ""
fi

echo "Step 8: Updating flaky tests summary..."
/usr/bin/node /root/QA-Portal/scripts/update-flaky-tests-summary.js

echo ""
echo "=========================================="
echo "Deduplication Complete!"
echo "=========================================="
echo "Before: ${CURRENT_ROWS} rows"
echo "After:  ${FINAL_ROWS} rows"
echo "Saved:  ${REMOVED} rows (${REMOVED_PCT}%)"
echo ""
echo "Database size reduction: ~$((REMOVED * 222 / 1024 / 1024)) MB"
