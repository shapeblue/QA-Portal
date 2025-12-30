#!/usr/bin/env node

/**
 * Clean Up Duplicate Test Results
 * 
 * This script removes duplicate test results, keeping only the most recent entry.
 * Run this periodically (e.g., daily) to clean up any duplicates that may have accumulated.
 * 
 * Cron: 0 2 * * * /usr/bin/node /root/QA-Portal/scripts/cleanup-duplicates.js
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

async function cleanupDuplicates() {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    console.log(`[${new Date().toISOString()}] Starting duplicate cleanup...`);
    
    // Delete duplicates in small batches to avoid locking the table
    let totalDeleted = 0;
    let batchSize = 10000;
    let hasMore = true;
    
    while (hasMore) {
      const [result] = await connection.execute(`
        DELETE FROM test_results
        WHERE id IN (
          SELECT id FROM (
            SELECT t1.id
            FROM test_results t1
            INNER JOIN (
              SELECT 
                pr_number, test_name, test_file, hypervisor, hypervisor_version, test_date,
                MAX(id) as keep_id
              FROM test_results
              GROUP BY pr_number, test_name, test_file, hypervisor, hypervisor_version, test_date
              HAVING COUNT(*) > 1
            ) t2 ON 
              t1.pr_number = t2.pr_number
              AND t1.test_name = t2.test_name
              AND COALESCE(t1.test_file, '') = COALESCE(t2.test_file, '')
              AND COALESCE(t1.hypervisor, '') = COALESCE(t2.hypervisor, '')
              AND COALESCE(t1.hypervisor_version, '') = COALESCE(t2.hypervisor_version, '')
              AND COALESCE(t1.test_date, '1970-01-01') = COALESCE(t2.test_date, '1970-01-01')
              AND t1.id < t2.keep_id
            LIMIT ${batchSize}
          ) AS subquery
        )
      `);
      
      const deleted = result.affectedRows;
      totalDeleted += deleted;
      
      if (deleted > 0) {
        console.log(`  Deleted ${deleted} duplicates (total: ${totalDeleted})`);
      }
      
      hasMore = deleted === batchSize;
      
      // Small delay to avoid overwhelming the database
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    if (totalDeleted === 0) {
      console.log('  No duplicates found - database is clean!');
    } else {
      console.log(`✓ Cleanup complete: removed ${totalDeleted} duplicate entries`);
      
      // Optimize table after cleanup
      console.log('Optimizing table...');
      await connection.execute('OPTIMIZE TABLE test_results');
      console.log('✓ Table optimized');
    }
    
  } catch (error) {
    console.error('Error during cleanup:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

cleanupDuplicates();
