#!/usr/bin/env node

/**
 * Update Flaky Tests Summary Table
 * 
 * This script aggregates test results from the last month and populates
 * the flaky_tests_summary table for fast querying.
 * 
 * Run this periodically (e.g., every hour) via cron:
 *   0 * * * * /usr/bin/node /root/QA-Portal/scripts/update-flaky-tests-summary.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: '/root/QA-Portal/.env' });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cloudstack_tests',
};

async function updateFlakyTestsSummary() {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    console.log(`[${new Date().toISOString()}] Starting flaky tests summary update...`);
    
    // Clear old data (older than 2 months to keep some history)
    await connection.execute(
      `DELETE FROM flaky_tests_summary 
       WHERE last_run_date < DATE_SUB(NOW(), INTERVAL 2 MONTH)`
    );
    
    // Aggregate data from last month
    console.log('Aggregating test results from last month...');
    const [results] = await connection.execute(`
      INSERT INTO flaky_tests_summary 
        (test_name, test_file, hypervisor, hypervisor_version,
         total_runs, failure_count, success_count, error_count,
         last_failure_date, last_success_date, last_run_date,
         pr_numbers, last_failure_log_url)
      SELECT 
        test_name,
        test_file,
        hypervisor,
        hypervisor_version,
        COUNT(*) as total_runs,
        SUM(CASE WHEN result = 'Failure' THEN 1 ELSE 0 END) as failure_count,
        SUM(CASE WHEN result = 'Success' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN result = 'Error' THEN 1 ELSE 0 END) as error_count,
        MAX(CASE WHEN result = 'Failure' THEN test_date END) as last_failure_date,
        MAX(CASE WHEN result = 'Success' THEN test_date END) as last_success_date,
        MAX(test_date) as last_run_date,
        GROUP_CONCAT(DISTINCT pr_number ORDER BY pr_number DESC SEPARATOR ',') as pr_numbers,
        MAX(CASE WHEN result = 'Failure' THEN logs_url END) as last_failure_log_url
      FROM test_results
      WHERE test_date >= DATE_SUB(NOW(), INTERVAL 1 MONTH)
        AND result IN ('Failure', 'Success', 'Error')
      GROUP BY test_name, test_file, hypervisor, hypervisor_version
      HAVING failure_count > 1
      ON DUPLICATE KEY UPDATE
        total_runs = VALUES(total_runs),
        failure_count = VALUES(failure_count),
        success_count = VALUES(success_count),
        error_count = VALUES(error_count),
        last_failure_date = VALUES(last_failure_date),
        last_success_date = VALUES(last_success_date),
        last_run_date = VALUES(last_run_date),
        pr_numbers = VALUES(pr_numbers),
        last_failure_log_url = VALUES(last_failure_log_url)
    `);
    
    console.log(`Summary updated: ${results.affectedRows} rows affected`);
    
    // Get stats
    const [stats] = await connection.execute(
      'SELECT COUNT(*) as total FROM flaky_tests_summary WHERE failure_count > 1'
    );
    
    console.log(`Total flaky test entries: ${stats[0].total}`);
    console.log(`[${new Date().toISOString()}] Flaky tests summary update completed successfully`);
    
  } catch (error) {
    console.error('Error updating flaky tests summary:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

updateFlakyTestsSummary();
