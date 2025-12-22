#!/usr/bin/env node

/**
 * Parse Test Failures from Trillian Comments
 * 
 * Extracts individual test failures from Trillian smoke test comments
 * and stores them in test_failures table for analysis
 */

const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cloudstack_tests',
};

// Parse test failure table from markdown
function parseTestFailures(comment) {
  if (!comment) return [];
  
  const failures = [];
  const lines = comment.split('\n');
  
  let inTable = false;
  let headerPassed = false;
  
  for (const line of lines) {
    // Look for table start (header row)
    if (line.includes('Test | Result | Time')) {
      inTable = true;
      continue;
    }
    
    // Skip separator line
    if (inTable && line.includes('---')) {
      headerPassed = true;
      continue;
    }
    
    // Parse data rows
    if (inTable && headerPassed && line.includes('|')) {
      // Skip if it's the separator line
      if (line.includes('---')) continue;
      
      const parts = line.split('|').map(p => p.trim());
      
      if (parts.length >= 4) {
        const testName = parts[0];
        const result = parts[1].replace(/`/g, ''); // Remove backticks
        const timeStr = parts[2];
        const testFile = parts[3];
        
        // Skip if empty test name
        if (!testName || testName === 'Test') continue;
        
        // Parse time
        let timeSeconds = null;
        const timeMatch = timeStr.match(/([\d.]+)/);
        if (timeMatch) {
          timeSeconds = parseFloat(timeMatch[1]);
        }
        
        failures.push({
          test_name: testName,
          result: result,
          time_seconds: timeSeconds,
          test_file: testFile
        });
      }
    }
    
    // Stop at empty line after table
    if (inTable && headerPassed && line.trim() === '') {
      break;
    }
  }
  
  return failures;
}

async function main() {
  console.log('🔬 Starting test failure parser...\n');
  
  const connection = await mysql.createConnection(dbConfig);
  console.log('✅ Connected to database\n');
  
  try {
    // Get all Trillian comments with failures
    const [comments] = await connection.execute(`
      SELECT 
        id,
        pr_number,
        hypervisor,
        version as hypervisor_version,
        trillian_comment,
        trillian_created_at,
        logs_url
      FROM pr_trillian_comments
      WHERE trillian_comment IS NOT NULL
        AND trillian_comment LIKE '%failed%'
        AND trillian_created_at IS NOT NULL
      ORDER BY trillian_created_at DESC
    `);
    
    console.log(`Found ${comments.length} comments with test results\n`);
    
    let totalFailures = 0;
    let processedComments = 0;
    
    for (const comment of comments) {
      const failures = parseTestFailures(comment.trillian_comment);
      
      if (failures.length > 0) {
        processedComments++;
        
        for (const failure of failures) {
          // Check if already exists
          const [existing] = await connection.execute(
            `SELECT id FROM test_failures 
             WHERE pr_number = ? 
               AND test_name = ? 
               AND hypervisor = ?
               AND hypervisor_version = ?`,
            [comment.pr_number, failure.test_name, comment.hypervisor, comment.hypervisor_version]
          );
          
          if (existing.length === 0) {
            await connection.execute(
              `INSERT INTO test_failures 
               (pr_number, test_name, test_file, result, time_seconds, 
                hypervisor, hypervisor_version, test_date, logs_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                comment.pr_number,
                failure.test_name,
                failure.test_file,
                failure.result,
                failure.time_seconds,
                comment.hypervisor,
                comment.hypervisor_version,
                comment.trillian_created_at,
                comment.logs_url
              ]
            );
            totalFailures++;
          }
        }
        
        if (processedComments % 10 === 0) {
          console.log(`  Processed ${processedComments} comments, ${totalFailures} failures stored...`);
        }
      }
    }
    
    console.log(`\n✅ Parsing complete!`);
    console.log(`   Processed: ${processedComments} comments`);
    console.log(`   New failures stored: ${totalFailures}`);
    
    // Show statistics
    const [stats] = await connection.execute(`
      SELECT 
        COUNT(DISTINCT test_name) as unique_tests,
        COUNT(*) as total_failures,
        COUNT(DISTINCT pr_number) as prs_with_failures,
        COUNT(DISTINCT hypervisor) as hypervisors
      FROM test_failures
    `);
    
    console.log(`\n📊 Database Statistics:`);
    console.log(`   Total failure records: ${stats[0].total_failures}`);
    console.log(`   Unique failing tests: ${stats[0].unique_tests}`);
    console.log(`   PRs with failures: ${stats[0].prs_with_failures}`);
    console.log(`   Hypervisors tested: ${stats[0].hypervisors}`);
    
  } finally {
    await connection.end();
  }
}

main().catch(console.error);
