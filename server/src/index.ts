import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '5001');

// Middleware
app.use(cors());
app.use(express.json());

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cloudstack_tests',
  connectionLimit: 10,
  connectTimeout: 60000,
  acquireTimeout: 60000,
  timeout: 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

// Create database connection pool
const pool = mysql.createPool(dbConfig);
console.log('Database connection pool created');

// Helper function to execute queries with retry logic
async function queryWithRetry<T = any>(
  sql: string,
  params?: any[],
  retries = 3
): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const [rows] = await pool.query(sql, params);
      return rows as T;
    } catch (error: any) {
      const isLastAttempt = attempt === retries - 1;
      const isTimeout = error.code === 'ETIMEDOUT' || error.errno === -60;
      
      if (isTimeout && !isLastAttempt) {
        console.log(`Query timeout, retrying... (attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
        continue;
      }
      
      throw error;
    }
  }
  throw new Error('Query failed after all retries');
}

// Types
interface SmokeTestResult {
  hypervisor: string;
  version?: string | null;
  passed: number;
  total: number;
  status: 'OK' | 'FAIL';
  logsUrl?: string;
  failedTests?: string[];
  createdAt?: string;
}

interface PRData {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  approvals: {
    approved: number;
    changesRequested: number;
    commented: number;
  };
  smokeTests: SmokeTestResult[];
  logsUrl?: string;
  codeCoverage?: {
    percentage: number;
    change: number;
    url: string;
  };
}

interface UpgradeTestResult {
  id: number;
  timestamp_start: string;
  timestamp_end?: string;
  duration_seconds?: number;
  upgraded_env_url?: string;
  jenkins_build_number?: number;
  management_server_os?: string;
  hypervisor?: string;
  hypervisor_version?: string;
  infrastructure_provider?: string;
  upgrade_start_version?: string;
  upgrade_target_version?: string;
  overall_status?: 'PASS' | 'FAIL' | 'ERROR' | 'SKIPPED' | null;
  failure_stage?: string;
  tests_data_created?: string;
  tests_data_post_upgrade_verification?: string;
  error_log?: string;
  upgrade_matrix_url?: string;
  comments?: string;
  upgrade_console?: string;
  build_console?: string;
}

// Database functions
async function getHealthPRsFromDatabase(): Promise<PRData[]> {
  const query = `
    SELECT DISTINCT
      l.pr_number,
      l.pr_title,
      l.pr_state,
      l.inserted_at
    FROM pr_health_labels l
    WHERE l.label_name = 'type:healthcheckrun'
      AND l.pr_state = 'open'
    ORDER BY l.inserted_at DESC
  `;
  
  const rows = await queryWithRetry<any[]>(query);
  
  if (rows.length === 0) {
    return [];
  }
  
  // Filter to only keep the latest entry for each unique PR number
  const latestPRs = new Map<number, any>();
  rows.forEach(row => {
    if (!latestPRs.has(row.pr_number)) {
      latestPRs.set(row.pr_number, row);
    }
  });
  
  // Further filter: For each version (e.g., "4.23"), keep only the most recent PR
  const versionMap = new Map<string, any>();
  Array.from(latestPRs.values()).forEach(row => {
    // Extract version from title (e.g., "4.23", "4.22", "4.20")
    const versionMatch = row.pr_title.match(/(\d+\.\d+)/);
    if (versionMatch) {
      const version = versionMatch[1];
      const existing = versionMap.get(version);
      // Keep the one with the later inserted_at timestamp
      if (!existing || new Date(row.inserted_at) > new Date(existing.inserted_at)) {
        versionMap.set(version, row);
      }
    } else {
      // If no version found in title, keep it anyway
      versionMap.set(`pr_${row.pr_number}`, row);
    }
  });
  
  // Get all PR numbers from filtered results
  const prNumbers = Array.from(versionMap.values()).map(r => r.pr_number);
  
  // Fetch all data in bulk with IN queries
  const [allTrillianResults, allCodecovResults, allReviewResults] = await Promise.all([
    queryWithRetry<any[]>(
      `SELECT pr_number, hypervisor, version, trillian_comment, trillian_created_at, logs_url FROM pr_trillian_comments WHERE pr_number IN (${prNumbers.map(() => '?').join(',')})`,
      prNumbers
    ),
    queryWithRetry<any[]>(
      `SELECT pr_number, codecov_comment, codecov_created_at FROM pr_codecov_comments WHERE pr_number IN (${prNumbers.map(() => '?').join(',')})`,
      prNumbers
    ),
    queryWithRetry<any[]>(
      `SELECT pa1.pr_number, pa1.approval_state as state, pa1.approval_created_at, pa1.approver_login
       FROM pr_approvals pa1
       INNER JOIN (
         SELECT pr_number, approver_login, MAX(approval_created_at) as max_date
         FROM pr_approvals
         WHERE pr_number IN (${prNumbers.map(() => '?').join(',')})
         GROUP BY pr_number, approver_login
       ) pa2 ON pa1.pr_number = pa2.pr_number 
         AND pa1.approver_login = pa2.approver_login 
         AND pa1.approval_created_at = pa2.max_date`,
      prNumbers
    ).catch(err => {
      console.warn('Could not fetch approvals:', err.message);
      return [];
    })
  ]);
  
  // Group results by PR number for quick lookup
  const trillianByPR = new Map<number, any[]>();
  const codecovByPR = new Map<number, any[]>();
  const reviewsByPR = new Map<number, any[]>();
  
  allTrillianResults.forEach(r => {
    if (!trillianByPR.has(r.pr_number)) trillianByPR.set(r.pr_number, []);
    trillianByPR.get(r.pr_number)!.push(r);
  });
  
  allCodecovResults.forEach(r => {
    if (!codecovByPR.has(r.pr_number)) codecovByPR.set(r.pr_number, []);
    codecovByPR.get(r.pr_number)!.push(r);
  });
  
  allReviewResults.forEach(r => {
    if (!reviewsByPR.has(r.pr_number)) reviewsByPR.set(r.pr_number, []);
    reviewsByPR.get(r.pr_number)!.push(r);
  });
  
  // Use the filtered version map instead of all rows
  const prDataPromises = Array.from(versionMap.values()).map(async (row) => {
    const trillianResults = trillianByPR.get(row.pr_number) || [];
    const codecovResults = codecovByPR.get(row.pr_number) || [];
    const reviewResults = reviewsByPR.get(row.pr_number) || [];
    
    // Parse smoke tests from Trillian comments
    const smokeTests: SmokeTestResult[] = trillianResults
      .map((tr: any): SmokeTestResult | null => {
        const comment = tr.trillian_comment || '';
        let passed = 0;
        let total = 0;
        
        // Parse "141 look OK, 0 have errors" pattern
        const okMatch = comment.match(/(\d+)\s+look\s+OK/i);
        const errorMatch = comment.match(/(\d+)\s+have\s+errors/i);
        
        if (okMatch) passed = parseInt(okMatch[1]);
        if (errorMatch && okMatch) total = passed + parseInt(errorMatch[1]);
        
        // Get logs URL from database field (preferred) or extract from comment as fallback
        let logsUrl = tr.logs_url;
        if (!logsUrl) {
          const logsMatch = comment.match(/https:\/\/[^\s)]+\.zip/i);
          logsUrl = logsMatch ? logsMatch[0] : undefined;
        }
        
        // Extract failed test names from markdown table format
        const failedTests: string[] = [];
        if (errorMatch && parseInt(errorMatch[1]) > 0) {
          // Parse markdown table format:
          // Test | Result | Time (s) | Test File
          // --- | --- | --- | ---
          // test_name | `Error` | 1.10 | test_file.py
          
          const lines = comment.split('\n');
          let inTable = false;
          
          for (const line of lines) {
            // Check if we're starting a table (header with "Test | Result")
            if (line.includes('Test') && line.includes('Result') && line.includes('|')) {
              inTable = true;
              continue;
            }
            
            // Skip separator line (--- | --- | ---)
            if (line.trim().startsWith('---')) {
              continue;
            }
            
            // If we're in a table and line has pipes, parse it
            if (inTable && line.includes('|')) {
              const columns = line.split('|').map((col: string) => col.trim());
              if (columns.length >= 2) {
                const testName = columns[0];
                const result = columns[1];
                
                // Check if this is a failed test (Error, Fail, etc.)
                if (testName.startsWith('test_') && 
                    (result.toLowerCase().includes('error') || 
                     result.toLowerCase().includes('fail'))) {
                  if (!failedTests.includes(testName)) {
                    failedTests.push(testName);
                  }
                }
              }
            } else if (inTable && line.trim() === '') {
              // Empty line might mean end of table
              inTable = false;
            }
          }
          
          // Fallback: also try simple pattern matching if table parsing didn't work
          if (failedTests.length === 0) {
            const testErrorPattern = /(test_\w+)[\s.]*(?:ERROR|FAIL|FAILED)/gi;
            let match;
            while ((match = testErrorPattern.exec(comment)) !== null) {
              if (!failedTests.includes(match[1])) {
                failedTests.push(match[1]);
              }
            }
          }
        }
        
        // Only return if we found actual test results
        if (okMatch && total > 0) {
          // Extract version from hypervisor name if not already in version field
          let version = tr.version;
          let hypervisor = tr.hypervisor;
          
          if (!version && hypervisor) {
            // Try to extract version from hypervisor name (e.g., "xcpng82" -> hypervisor="xcpng", version="82")
            const hvMatch = hypervisor.match(/^([a-z]+)(.+)$/i);
            if (hvMatch) {
              const hvName = hvMatch[1];
              const hvVersion = hvMatch[2];
              // Only extract if the second part looks like a version (contains numbers)
              if (/\d/.test(hvVersion)) {
                hypervisor = hvName;
                version = hvVersion;
              }
            }
          }
          
          return {
            hypervisor: hypervisor?.toUpperCase() || 'UNKNOWN',
            version: version || null,
            passed,
            total,
            status: (errorMatch && parseInt(errorMatch[1]) > 0) ? 'FAIL' as const : 'OK' as const,
            logsUrl,
            failedTests: failedTests.length > 0 ? failedTests : undefined,
            createdAt: tr.trillian_created_at
          };
        }
        return null;
      })
      .filter((test): test is SmokeTestResult => test !== null);
    
    // Extract logs URL from Trillian comment
    let logsUrl: string | undefined;
    if (trillianResults.length > 0) {
      const comment = trillianResults[0].trillian_comment || '';
      const logsMatch = comment.match(/https:\/\/[^\s)]+\.zip/i);
      if (logsMatch) logsUrl = logsMatch[0];
    }
    
    // Parse code coverage from codecov comment
    let codeCoverage: { percentage: number; change: number; url: string } | undefined;
    if (codecovResults.length > 0) {
      const codecovComment = codecovResults[0].codecov_comment || '';
      
      // Try to parse coverage percentage - common formats:
      // "Coverage: 85.23%" or "85.23% (+2.1%)" or "Coverage is 85.23%"
      const coverageMatch = codecovComment.match(/(\d+\.?\d*)%/);
      
      // Try to parse coverage change - formats: "+2.1%" or "-1.5%" or "increased by 2.1%"
      const changeMatch = codecovComment.match(/([+-]\d+\.?\d*)%/) || 
                          codecovComment.match(/(increased|decreased)\s+by\s+(\d+\.?\d*)%/i);
      
      // Extract codecov URL
      const urlMatch = codecovComment.match(/(https?:\/\/(?:app\.)?codecov\.io\/[^\s)]+)/i);
      
      if (coverageMatch) {
        let change = 0;
        if (changeMatch) {
          if (changeMatch[1] && (changeMatch[1] === 'increased' || changeMatch[1] === 'decreased')) {
            change = parseFloat(changeMatch[2] || '0');
            if (changeMatch[1] === 'decreased') change = -change;
          } else {
            change = parseFloat(changeMatch[1]);
          }
        }
        
        codeCoverage = {
          percentage: parseFloat(coverageMatch[1]),
          change: change,
          url: urlMatch ? urlMatch[1] : `https://app.codecov.io/gh/apache/cloudstack/pull/${row.pr_number}`
        };
      }
    }
    
    // Count review states
    const approvals = {
      approved: reviewResults.filter((r: any) => r.state === 'APPROVED').length,
      changesRequested: reviewResults.filter((r: any) => r.state === 'CHANGES_REQUESTED').length,
      commented: reviewResults.filter((r: any) => r.state === 'COMMENTED').length,
    };
    
    // Calculate latest update timestamp from all sources
    const timestamps: Date[] = [];
    
    // Add initial timestamp
    if (row.inserted_at) timestamps.push(new Date(row.inserted_at));
    
    // Add Trillian timestamps (skip NULLs)
    trillianResults.forEach((tr: any) => {
      if (tr.trillian_created_at) timestamps.push(new Date(tr.trillian_created_at));
    });
    
    // Add codecov timestamp
    if (codecovResults.length > 0 && codecovResults[0].codecov_created_at) {
      timestamps.push(new Date(codecovResults[0].codecov_created_at));
    }
    
    // Add review timestamps (skip NULLs)
    reviewResults.forEach((r: any) => {
      if (r.approval_created_at) timestamps.push(new Date(r.approval_created_at));
    });
    
    const latestUpdate = timestamps.length > 0 
      ? new Date(Math.max(...timestamps.map(d => d.getTime())))
      : new Date(row.inserted_at);
    
    return {
      number: row.pr_number,
      title: row.pr_title,
      url: `https://github.com/apache/cloudstack/pull/${row.pr_number}`,
      createdAt: row.inserted_at,
      updatedAt: latestUpdate.toISOString(),
      approvals,
      smokeTests,
      logsUrl,
      codeCoverage,
    };
  });
  
  return await Promise.all(prDataPromises);
}

async function getPRFromDatabase(prNumber: number): Promise<PRData | null> {
  // First check if PR has Trillian test results (this is the primary data source)
  const trillianResults = await queryWithRetry<any[]>(
    'SELECT pr_number, pr_title, hypervisor, version, trillian_comment, trillian_created_at, logs_url FROM pr_trillian_comments WHERE pr_number = ?',
    [prNumber]
  );
  
  if (trillianResults.length === 0) {
    return null;
  }

  // Use first result for basic PR info
  const firstResult = trillianResults[0];
  const prTitle = firstResult.pr_title || `PR #${prNumber}`;
  
  // Find first non-NULL timestamp for createdAt
  let insertedAt = firstResult.trillian_created_at;
  if (!insertedAt) {
    // Look for first non-NULL timestamp in results
    for (const tr of trillianResults) {
      if (tr.trillian_created_at) {
        insertedAt = tr.trillian_created_at;
        break;
      }
    }
  }
  // If still null, use current time as fallback
  if (!insertedAt) {
    insertedAt = new Date().toISOString();
  }
  
  // Parse smoke tests
  const smokeTests: SmokeTestResult[] = trillianResults
    .map((tr: any): SmokeTestResult | null => {
      const comment = tr.trillian_comment || '';
      let passed = 0;
      let total = 0;
      
      const okMatch = comment.match(/(\d+)\s+look\s+OK/i);
      const errorMatch = comment.match(/(\d+)\s+have\s+errors/i);
      const skippedMatch = comment.match(/(\d+)\s+did\s+not\s+run/i);
      
      if (okMatch) passed = parseInt(okMatch[1]);
      if (errorMatch && okMatch) {
        total = passed + parseInt(errorMatch[1]);
        // Also add skipped tests to total if present
        if (skippedMatch) {
          total += parseInt(skippedMatch[1]);
        }
      } else if (okMatch && skippedMatch) {
        // If only OK and skipped (no errors)
        total = passed + parseInt(skippedMatch[1]);
      } else if (okMatch) {
        // If only OK count, use it as total
        total = passed;
      }
      
      // Extract logs URL for this hypervisor
      const logsMatch = comment.match(/https:\/\/[^\s)]+\.zip/i);
      const logsUrl = logsMatch ? logsMatch[0] : undefined;
      
      // Extract failed test names
      const failedTests: string[] = [];
      if (errorMatch && parseInt(errorMatch[1]) > 0) {
        // Parse markdown table format: "test_name | `Error` | time | file"
        const tableRowPattern = /^\s*(\w*test_\w+)\s*\|\s*`(Error|Failure|error|failure)`/gm;
        let match;
        while ((match = tableRowPattern.exec(comment)) !== null) {
          const testName = match[1];
          if (testName && !failedTests.includes(testName)) {
            failedTests.push(testName);
          }
        }
        
        // Fallback: parse simple "test_name ERROR/FAIL" pattern
        if (failedTests.length === 0) {
          const testErrorPattern = /(test_\w+)[\s.]*(?:ERROR|FAIL|FAILED)/gi;
          while ((match = testErrorPattern.exec(comment)) !== null) {
            if (!failedTests.includes(match[1])) {
              failedTests.push(match[1]);
            }
          }
        }
        
        // Verify we found the right number of failed tests
        const expectedFailures = parseInt(errorMatch[1]);
        if (failedTests.length > 0 && failedTests.length !== expectedFailures) {
          console.warn(`PR #${prNumber} ${tr.hypervisor}: Found ${failedTests.length} failed test names but summary says ${expectedFailures} failures`);
        }
      }
      
      // Only return if we found actual test results
      if (okMatch && total > 0) {
        const hasErrors = errorMatch && parseInt(errorMatch[1]) > 0;
        
        // Extract version from hypervisor name if not already in version field
        let version = tr.version;
        let hypervisor = tr.hypervisor;
        
        if (!version && hypervisor) {
          // Try to extract version from hypervisor name (e.g., "xcpng82" -> hypervisor="xcpng", version="82")
          const hvMatch = hypervisor.match(/^([a-z]+)(.+)$/i);
          if (hvMatch) {
            const hvName = hvMatch[1];
            const hvVersion = hvMatch[2];
            // Only extract if the second part looks like a version (contains numbers)
            if (/\d/.test(hvVersion)) {
              hypervisor = hvName;
              version = hvVersion;
            }
          }
        }
        
        return {
          hypervisor: hypervisor?.toUpperCase() || 'UNKNOWN',
          version: version || null,
          passed,
          total,
          status: hasErrors ? 'FAIL' as const : 'OK' as const,
          logsUrl,
          // Always include failedTests array when there are errors (even if parsing failed)
          failedTests: hasErrors ? (failedTests.length > 0 ? failedTests : []) : undefined,
          createdAt: tr.trillian_created_at
        };
      }
      return null;
    })
    .filter((test): test is SmokeTestResult => test !== null);
  
  let logsUrl: string | undefined;
  if (trillianResults.length > 0) {
    const comment = trillianResults[0].trillian_comment || '';
    const logsMatch = comment.match(/https:\/\/[^\s)]+\.zip/i);
    if (logsMatch) logsUrl = logsMatch[0];
  }
  
  // Get codecov data
  const codecovResults = await queryWithRetry<any[]>(
    'SELECT codecov_comment, codecov_created_at FROM pr_codecov_comments WHERE pr_number = ? LIMIT 1',
    [prNumber]
  );
  
  // Get PR approvals data - get latest review per approver
  let reviewResults: any[] = [];
  try {
    reviewResults = await queryWithRetry<any[]>(
      `SELECT pa1.approval_state as state, pa1.approval_created_at, pa1.approver_login
       FROM pr_approvals pa1
       INNER JOIN (
         SELECT approver_login, MAX(approval_created_at) as max_date
         FROM pr_approvals
         WHERE pr_number = ?
         GROUP BY approver_login
       ) pa2 ON pa1.approver_login = pa2.approver_login 
         AND pa1.approval_created_at = pa2.max_date
       WHERE pa1.pr_number = ?`,
      [prNumber, prNumber]
    );
  } catch (err: any) {
    console.warn(`Could not fetch approvals for PR #${prNumber}:`, err.message);
  }
  
  // Parse code coverage
  let codeCoverage: { percentage: number; change: number; url: string } | undefined;
  if (codecovResults.length > 0) {
    const codecovComment = codecovResults[0].codecov_comment || '';
    
    const coverageMatch = codecovComment.match(/(\d+\.?\d*)%/);
    const changeMatch = codecovComment.match(/([+-]\d+\.?\d*)%/) || 
                        codecovComment.match(/(increased|decreased)\s+by\s+(\d+\.?\d*)%/i);
    const urlMatch = codecovComment.match(/(https?:\/\/(?:app\.)?codecov\.io\/[^\s)]+)/i);
    
    if (coverageMatch) {
      let change = 0;
      if (changeMatch) {
        if (changeMatch[1] && (changeMatch[1] === 'increased' || changeMatch[1] === 'decreased')) {
          change = parseFloat(changeMatch[2] || '0');
          if (changeMatch[1] === 'decreased') change = -change;
        } else {
          change = parseFloat(changeMatch[1]);
        }
      }
      
      codeCoverage = {
        percentage: parseFloat(coverageMatch[1]),
        change: change,
        url: urlMatch ? urlMatch[1] : `https://app.codecov.io/gh/apache/cloudstack/pull/${prNumber}`
      };
    }
  }
  
  // Count review states
  const approvals = {
    approved: reviewResults.filter((r: any) => r.state === 'APPROVED').length,
    changesRequested: reviewResults.filter((r: any) => r.state === 'CHANGES_REQUESTED').length,
    commented: reviewResults.filter((r: any) => r.state === 'COMMENTED').length,
  };
  
  // Calculate latest update timestamp from all sources
  const timestamps: Date[] = [];
  
  // Add initial timestamp
  if (insertedAt) timestamps.push(new Date(insertedAt));
  
  // Add Trillian timestamps (skip NULLs)
  trillianResults.forEach((tr: any) => {
    if (tr.trillian_created_at) timestamps.push(new Date(tr.trillian_created_at));
  });
  
  // Add codecov timestamp
  if (codecovResults.length > 0 && codecovResults[0].codecov_created_at) {
    timestamps.push(new Date(codecovResults[0].codecov_created_at));
  }
  
  // Add review timestamps (skip NULLs)
  reviewResults.forEach((r: any) => {
    if (r.approval_created_at) timestamps.push(new Date(r.approval_created_at));
  });
  
  const latestUpdate = timestamps.length > 0 
    ? new Date(Math.max(...timestamps.map(d => d.getTime())))
    : new Date(insertedAt);
  
  return {
    number: prNumber,
    title: prTitle,
    url: `https://github.com/apache/cloudstack/pull/${prNumber}`,
    createdAt: insertedAt,
    updatedAt: latestUpdate.toISOString(),
    approvals,
    smokeTests,
    logsUrl,
    codeCoverage,
  };
}

// Upgrade test functions
async function getUpgradeTestsFromDatabase(filters?: {
  fromVersion?: string;
  toVersion?: string;
  distro?: string;
  hypervisor?: string;
  status?: string;
}): Promise<UpgradeTestResult[]> {
  let query = `
    SELECT 
      id,
      timestamp_start,
      timestamp_end,
      duration_seconds,
      upgraded_env_url,
      jenkins_build_number,
      management_server_os,
      hypervisor,
      hypervisor_version,
      infrastructure_provider,
      upgrade_start_version,
      upgrade_target_version,
      overall_status,
      failure_stage,
      tests_data_created,
      tests_data_post_upgrade_verification,
      error_log,
      upgrade_matrix_url,
      comments,
      upgrade_console,
      build_console
    FROM upgrade_test_results
    WHERE 1=1
      AND (upgrade_start_version IS NOT NULL AND upgrade_start_version != 'null' AND upgrade_start_version != '')
      AND (upgrade_target_version IS NOT NULL AND upgrade_target_version != 'null' AND upgrade_target_version != '')
  `;
  
  const params: any[] = [];
  
  if (filters?.fromVersion) {
    query += ' AND upgrade_start_version = ?';
    params.push(filters.fromVersion);
  }
  
  if (filters?.toVersion) {
    query += ' AND upgrade_target_version = ?';
    params.push(filters.toVersion);
  }
  
  if (filters?.distro) {
    query += ' AND management_server_os = ?';
    params.push(filters.distro);
  }
  
  if (filters?.hypervisor) {
    query += ' AND hypervisor = ?';
    params.push(filters.hypervisor);
  }
  
  if (filters?.status) {
    query += ' AND overall_status = ?';
    params.push(filters.status);
  }
  
  query += ' ORDER BY timestamp_start DESC LIMIT 100';
  
  const rows = await queryWithRetry<UpgradeTestResult[]>(query, params);
  return rows;
}

async function getUpgradeTestFilters() {
  const versions = await queryWithRetry<any[]>(
    `SELECT DISTINCT upgrade_start_version, upgrade_target_version 
     FROM upgrade_test_results 
     WHERE upgrade_start_version IS NOT NULL 
       AND upgrade_target_version IS NOT NULL
       AND upgrade_start_version != 'null'
       AND upgrade_target_version != 'null'
       AND upgrade_start_version != ''
       AND upgrade_target_version != ''
     ORDER BY upgrade_start_version DESC`
  );
  
  const distros = await queryWithRetry<any[]>(
    'SELECT DISTINCT management_server_os FROM upgrade_test_results WHERE management_server_os IS NOT NULL ORDER BY management_server_os'
  );
  
  const hypervisors = await queryWithRetry<any[]>(
    'SELECT DISTINCT hypervisor FROM upgrade_test_results WHERE hypervisor IS NOT NULL ORDER BY hypervisor'
  );
  
  return {
    versions: versions,
    distros: distros.map((d: any) => d.management_server_os),
    hypervisors: hypervisors.map((h: any) => h.hypervisor),
  };
}

async function getUpgradeTestStats() {
  const stats = await queryWithRetry<any[]>(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN overall_status = 'PASS' THEN 1 ELSE 0 END) as passed,
      SUM(CASE WHEN overall_status = 'FAIL' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN overall_status = 'ERROR' THEN 1 ELSE 0 END) as error,
      SUM(CASE WHEN overall_status = 'SKIPPED' THEN 1 ELSE 0 END) as skipped,
      SUM(CASE WHEN overall_status IS NULL THEN 1 ELSE 0 END) as running,
      MAX(timestamp_start) as latest_test_date
    FROM upgrade_test_results
    WHERE (upgrade_start_version IS NOT NULL AND upgrade_start_version != 'null' AND upgrade_start_version != '')
      AND (upgrade_target_version IS NOT NULL AND upgrade_target_version != 'null' AND upgrade_target_version != '')
  `);
  
  return stats[0];
}

// API Routes

// Get ALL open PRs (not just health check labeled ones)
async function getAllOpenPRsFromDatabase(): Promise<PRData[]> {
  console.log('[DEBUG] getAllOpenPRsFromDatabase called');
  // Get all unique open PRs from multiple sources, using pr_states for accurate state
  const allPRs = await queryWithRetry<any[]>(`
    SELECT 
      pr_number,
      MAX(pr_title) as pr_title,
      MAX(pr_state) as pr_state,
      MAX(inserted_at) as inserted_at,
      MAX(assignees) as assignees
    FROM (
      -- Get from pr_approvals (PRs with reviews)
      SELECT DISTINCT 
        pa.pr_number,
        COALESCE(pa.pr_title, ps.pr_title, 'PR without title') as pr_title,
        COALESCE(ps.pr_state, 'open') as pr_state,
        COALESCE(phl.inserted_at, pa.approval_created_at, NOW()) as inserted_at,
        ps.assignees
      FROM pr_approvals pa
      LEFT JOIN pr_states ps ON pa.pr_number = ps.pr_number
      LEFT JOIN pr_health_labels phl ON pa.pr_number = phl.pr_number
      WHERE COALESCE(ps.pr_state, 'open') = 'open'
      
      UNION
      
      -- Get from pr_states (all PRs we know about)
      SELECT DISTINCT
        ps.pr_number,
        ps.pr_title,
        ps.pr_state,
        ps.last_checked as inserted_at,
        ps.assignees
      FROM pr_states ps
      WHERE ps.pr_state = 'open'
      
      UNION
      
      -- Get from pr_health_labels (health check PRs)
      SELECT DISTINCT
        phl.pr_number,
        phl.pr_title,
        COALESCE(ps.pr_state, phl.pr_state, 'open') as pr_state,
        phl.inserted_at,
        ps.assignees
      FROM pr_health_labels phl
      LEFT JOIN pr_states ps ON phl.pr_number = ps.pr_number
      WHERE COALESCE(ps.pr_state, phl.pr_state, 'open') = 'open'
    ) AS unique_prs
    GROUP BY pr_number
    ORDER BY pr_number DESC
  `);
  
  if (allPRs.length === 0) {
    return [];
  }

  const prNumbers = allPRs.map(r => r.pr_number);
  
  // Fetch all data in bulk
  const [allTrillianResults, allCodecovResults, allReviewResults, allLabelsResults] = await Promise.all([
    queryWithRetry<any[]>(
      `SELECT pr_number, hypervisor, version, trillian_comment, trillian_created_at, logs_url FROM pr_trillian_comments WHERE pr_number IN (${prNumbers.map(() => '?').join(',')})`,
      prNumbers
    ),
    queryWithRetry<any[]>(
      `SELECT pr_number, codecov_comment, codecov_created_at FROM pr_codecov_comments WHERE pr_number IN (${prNumbers.map(() => '?').join(',')})`,
      prNumbers
    ),
    queryWithRetry<any[]>(
      `SELECT pa1.pr_number, pa1.approval_state as state, pa1.approval_created_at, pa1.approver_login
       FROM pr_approvals pa1
       INNER JOIN (
         SELECT pr_number, approver_login, MAX(approval_created_at) as max_date
         FROM pr_approvals
         WHERE pr_number IN (${prNumbers.map(() => '?').join(',')})
         GROUP BY pr_number, approver_login
       ) pa2 ON pa1.pr_number = pa2.pr_number 
         AND pa1.approver_login = pa2.approver_login 
         AND pa1.approval_created_at = pa2.max_date`,
      prNumbers
    ).catch(err => {
      console.warn('Could not fetch approvals:', err.message);
      return [];
    }),
    queryWithRetry<any[]>(
      `SELECT DISTINCT pr_number, label_name FROM pr_health_labels WHERE pr_number IN (${prNumbers.map(() => '?').join(',')})`,
      prNumbers
    ).catch(err => {
      console.warn('Could not fetch labels:', err.message);
      return [];
    })
  ]);

  // Process each PR
  const prDataPromises = allPRs.map(async row => {
    const prNumber = row.pr_number;
    const prTitle = row.pr_title;

    // Get Trillian results for this PR
    const trillianResults = allTrillianResults.filter((tr: any) => tr.pr_number === prNumber);
    
    // Parse smoke tests
    const smokeTests: SmokeTestResult[] = trillianResults
      .map((tr: any): SmokeTestResult | null => {
        const comment = tr.trillian_comment || '';
        let passed = 0;
        let total = 0;
        
        const okMatch = comment.match(/(\d+)\s+look\s+OK/i);
        const errorMatch = comment.match(/(\d+)\s+have\s+errors/i);
        const skippedMatch = comment.match(/(\d+)\s+did\s+not\s+run/i);
        
        if (okMatch) passed = parseInt(okMatch[1]);
        if (errorMatch && okMatch) {
          total = passed + parseInt(errorMatch[1]);
          if (skippedMatch) {
            total += parseInt(skippedMatch[1]);
          }
        } else if (okMatch && skippedMatch) {
          total = passed + parseInt(skippedMatch[1]);
        } else if (okMatch) {
          total = passed;
        }
        
        if (!tr.hypervisor || total === 0) return null;
        
        console.log(`[DEBUG getAllOpenPRs] Processing PR #${prNumber} hypervisor:`, tr.hypervisor, 'version:', tr.version, 'total:', total);
        
        const status = passed === total ? 'OK' : 'FAIL';
        
        // Get logs URL from database field (preferred) or extract from comment as fallback
        let logsUrl = tr.logs_url;
        if (!logsUrl) {
          const logsMatch = comment.match(/https:\/\/[^\s)]+\.zip/i);
          logsUrl = logsMatch ? logsMatch[0] : undefined;
        }
        
        // Extract version from hypervisor name if not already in version field
        let version = tr.version;
        let hypervisor = tr.hypervisor;
        
        if (!version && hypervisor) {
          // Try to extract version from hypervisor name (e.g., "xcpng82" -> hypervisor="xcpng", version="82")
          const hvMatch = hypervisor.match(/^([a-z]+)(.+)$/i);
          if (hvMatch) {
            const hvName = hvMatch[1];
            const hvVersion = hvMatch[2];
            // Only extract if the second part looks like a version (contains numbers)
            if (/\d/.test(hvVersion)) {
              console.log(`[DEBUG] Extracted version from ${hypervisor}: hv=${hvName}, ver=${hvVersion}`);
              hypervisor = hvName;
              version = hvVersion;
            }
          }
        }
        
        return {
          hypervisor: hypervisor.toUpperCase(),
          version: version || null,
          passed,
          total,
          status,
          logsUrl,
          createdAt: tr.trillian_created_at || new Date().toISOString()
        };
      })
      .filter((st): st is SmokeTestResult => st !== null);

    // Get codecov for this PR
    const codecovResults = allCodecovResults.filter((cc: any) => cc.pr_number === prNumber);
    let codeCoverage: { percentage: number; change: number; url: string } | undefined;
    if (codecovResults.length > 0 && codecovResults[0].codecov_comment) {
      const codecovComment = codecovResults[0].codecov_comment || '';
      const coverageMatch = codecovComment.match(/(\d+\.?\d*)%/);
      const changeMatch = codecovComment.match(/([+-]\d+\.?\d*)%/) || codecovComment.match(/(\d+\.?\d*)% of diff/);
      
      if (coverageMatch) {
        const percentage = parseFloat(coverageMatch[1]);
        let change = 0;
        if (changeMatch) {
          const changeStr = changeMatch[1];
          change = parseFloat(changeStr);
        }
        
        codeCoverage = {
          percentage,
          change,
          url: `https://github.com/apache/cloudstack/pull/${prNumber}`
        };
      }
    }

    // Get reviews for this PR
    const reviewResults = allReviewResults.filter((r: any) => r.pr_number === prNumber);
    const approvals = {
      approved: reviewResults.filter((r: any) => r.state === 'APPROVED').length,
      changesRequested: reviewResults.filter((r: any) => r.state === 'CHANGES_REQUESTED').length,
      commented: reviewResults.filter((r: any) => r.state === 'COMMENTED').length,
    };
    
    // Calculate latest update timestamp from all sources
    const timestamps: Date[] = [];
    
    if (row.inserted_at) timestamps.push(new Date(row.inserted_at));
    
    trillianResults.forEach((tr: any) => {
      if (tr.trillian_created_at) timestamps.push(new Date(tr.trillian_created_at));
    });
    
    if (codecovResults.length > 0 && codecovResults[0].codecov_created_at) {
      timestamps.push(new Date(codecovResults[0].codecov_created_at));
    }
    
    reviewResults.forEach((r: any) => {
      if (r.approval_created_at) timestamps.push(new Date(r.approval_created_at));
    });
    
    const latestUpdate = timestamps.length > 0 
      ? new Date(Math.max(...timestamps.map(d => d.getTime())))
      : new Date(row.inserted_at);
    
    // Get labels for this PR
    const labels = allLabelsResults
      .filter((l: any) => l.pr_number === prNumber)
      .map((l: any) => l.label_name);
    
    // Parse assignees from JSON string
    let assignees: string[] = [];
    if (row.assignees) {
      try {
        assignees = JSON.parse(row.assignees);
      } catch (e) {
        // If not valid JSON, treat as empty array
        assignees = [];
      }
    }
    
    return {
      number: prNumber,
      title: prTitle,
      url: `https://github.com/apache/cloudstack/pull/${prNumber}`,
      createdAt: row.inserted_at,
      updatedAt: latestUpdate.toISOString(),
      approvals,
      smokeTests,
      logsUrl: undefined,
      codeCoverage,
      labels,
      assignees,
    };
  });
  
  return await Promise.all(prDataPromises);
}

// Get health check PRs
app.get('/api/health-prs', async (req: Request, res: Response) => {
  try {
    const prData = await getHealthPRsFromDatabase();
    res.json(prData);
  } catch (error: any) {
    console.error('Error fetching health PRs:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch health check PRs' });
  }
});

// Get ALL open PRs
app.get('/api/all-open-prs', async (req: Request, res: Response) => {
  console.log('[DEBUG] /api/all-open-prs endpoint hit');
  try {
    const prData = await getAllOpenPRsFromDatabase();
    console.log('[DEBUG] Returning', prData.length, 'PRs');
    res.json(prData);
  } catch (error: any) {
    console.error('Error fetching all open PRs:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch all open PRs' });
  }
});

// Get ready to merge PRs
app.get('/api/ready-to-merge', async (req: Request, res: Response) => {
  try {
    const allPRs = await getHealthPRsFromDatabase();
    
    // Filter PRs that meet "ready to merge" criteria:
    // - 2+ APPROVED reviews
    // - 0 CHANGES_REQUESTED reviews
    // - All smoke tests passing (or at least 1 passing if multiple)
    const readyPRs = allPRs.filter(pr => {
      const hasEnoughApprovals = pr.approvals.approved >= 2;
      const hasNoRejections = pr.approvals.changesRequested === 0;
      
      // Check smoke tests - at least one test and all passing
      const hasSmokeTests = pr.smokeTests.length > 0;
      const allTestsPassing = pr.smokeTests.every(test => test.status === 'OK');
      
      return hasEnoughApprovals && hasNoRejections && hasSmokeTests && allTestsPassing;
    });
    
    // Sort by number of approvals (descending), then by updated date
    readyPRs.sort((a, b) => {
      if (b.approvals.approved !== a.approvals.approved) {
        return b.approvals.approved - a.approvals.approved;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    
    res.json(readyPRs);
  } catch (error: any) {
    console.error('Error fetching ready to merge PRs:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch ready to merge PRs' });
  }
});

// Upgrade test endpoints
app.get('/api/upgrade-tests', async (req: Request, res: Response) => {
  try {
    const filters = {
      fromVersion: req.query.fromVersion as string,
      toVersion: req.query.toVersion as string,
      distro: req.query.distro as string,
      hypervisor: req.query.hypervisor as string,
      status: req.query.status as string,
    };
    
    const results = await getUpgradeTestsFromDatabase(filters);
    res.json(results);
  } catch (error: any) {
    console.error('Error fetching upgrade tests:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch upgrade tests' });
  }
});

app.get('/api/upgrade-tests/filters', async (req: Request, res: Response) => {
  try {
    const filters = await getUpgradeTestFilters();
    res.json(filters);
  } catch (error: any) {
    console.error('Error fetching upgrade test filters:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch filters' });
  }
});

app.get('/api/upgrade-tests/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getUpgradeTestStats();
    res.json(stats);
  } catch (error: any) {
    console.error('Error fetching upgrade test stats:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch stats' });
  }
});

// Get specific PR by number
app.get('/api/pr/:number', async (req: Request, res: Response) => {
  try {
    const prNumber = parseInt(req.params.number);

    if (isNaN(prNumber)) {
      return res.status(400).json({ error: 'Invalid PR number' });
    }

    const prData = await getPRFromDatabase(prNumber);
    
    if (!prData) {
      return res.status(404).json({ error: 'PR not found' });
    }

    res.json(prData);
  } catch (error: any) {
    console.error('Error fetching PR:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch PR' });
  }
});

// Artifact download proxy endpoint
app.get('/api/download-artifact/:artifactId', async (req: Request, res: Response) => {
  const { artifactId } = req.params;
  
  try {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      return res.status(500).json({ error: 'GitHub token not configured' });
    }

    // Get artifact details first
    const artifactUrl = `https://api.github.com/repos/apache/cloudstack/actions/artifacts/${artifactId}`;
    const artifactResponse = await axios.get(artifactUrl, {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    const artifactName = artifactResponse.data.name || `artifact-${artifactId}`;

    // Download the artifact archive
    const downloadUrl = `https://api.github.com/repos/apache/cloudstack/actions/artifacts/${artifactId}/zip`;
    const downloadResponse = await axios.get(downloadUrl, {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
      responseType: 'stream',
    });

    // Set headers for file download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${artifactName}.zip"`);

    // Pipe the stream to response
    downloadResponse.data.pipe(res);
  } catch (error: any) {
    console.error('Error downloading artifact:', error.message);
    if (error.response?.status === 410) {
      res.status(410).json({ error: 'Artifact has expired or been deleted' });
    } else if (error.response?.status === 404) {
      res.status(404).json({ error: 'Artifact not found' });
    } else {
      res.status(500).json({ error: 'Failed to download artifact' });
    }
  }
});

// Get test failures for a specific PR with classification
app.get('/api/prs/:prNumber/test-failures', async (req: Request, res: Response) => {
  try {
    const prNumber = parseInt(req.params.prNumber);
    
    // Get failures for this PR
    const failures = await queryWithRetry<any[]>(
      `SELECT 
        id, pr_number, test_name, test_file, result, time_seconds,
        hypervisor, hypervisor_version, test_date, logs_url
       FROM test_results
       WHERE pr_number = ?
       ORDER BY test_name`,
      [prNumber]
    );
    
    // Classify each failure (common vs unique)
    for (const failure of failures) {
      // Count occurrences in other PRs
      const occurrences = await queryWithRetry<any[]>(
        `SELECT COUNT(DISTINCT pr_number) as count
         FROM test_results
         WHERE test_name = ?
           AND pr_number != ?`,
        [failure.test_name, prNumber]
      );
      
      const otherPRCount = occurrences[0]?.count || 0;
      failure.is_common = otherPRCount >= 2; // Seen in 2+ other PRs
      failure.occurrence_count = otherPRCount + 1; // Including this PR
      failure.severity = failure.is_common ? 'low' : 'high';
    }
    
    res.json(failures);
  } catch (error) {
    console.error('Error fetching test failures:', error);
    res.status(500).json({ error: 'Failed to fetch test failures' });
  }
});

// Get smoke test failures summary
app.get('/api/test-failures/summary', async (req: Request, res: Response) => {
  try {
    // Get statistics
    const stats = await queryWithRetry<any[]>(
      `SELECT 
        COUNT(*) as total_failures,
        COUNT(DISTINCT test_name) as unique_tests,
        COUNT(DISTINCT pr_number) as prs_affected,
        ROUND(COUNT(*) / COUNT(DISTINCT pr_number), 2) as avg_failures_per_pr
       FROM test_results`
    );
    
    // Get most common failures (flaky tests)
    const commonFailures = await queryWithRetry<any[]>(
      `SELECT 
        test_name,
        test_file,
        COUNT(*) as occurrence_count,
        COUNT(DISTINCT pr_number) as pr_count,
        GROUP_CONCAT(DISTINCT hypervisor ORDER BY hypervisor) as hypervisors,
        MAX(test_date) as last_seen,
        MIN(test_date) as first_seen
       FROM test_results
       GROUP BY test_name, test_file
       HAVING pr_count > 2
       ORDER BY pr_count DESC, occurrence_count DESC
       LIMIT 20`
    );
    
    // Get recent failures (last 7 days)
    const recentFailures = await queryWithRetry<any[]>(
      `SELECT 
        tf.id, tf.pr_number, tf.test_name, tf.test_file, tf.result,
        tf.hypervisor, tf.hypervisor_version, tf.test_date,
        (SELECT COUNT(DISTINCT pr_number) 
         FROM test_results tf2 
         WHERE tf2.test_name = tf.test_name 
           AND tf2.pr_number != tf.pr_number) as other_pr_count
       FROM test_results tf
       WHERE tf.test_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       ORDER BY tf.test_date DESC
       LIMIT 50`
    );
    
    // Classify recent failures
    for (const failure of recentFailures) {
      failure.is_common = failure.other_pr_count >= 2;
    }
    
    // Get failures by hypervisor
    const byHypervisor = await queryWithRetry<any[]>(
      `SELECT 
        CONCAT(hypervisor, '-', hypervisor_version) as platform,
        COUNT(*) as failure_count,
        COUNT(DISTINCT test_name) as unique_tests,
        COUNT(DISTINCT pr_number) as pr_count
       FROM test_results
       WHERE hypervisor IS NOT NULL
       GROUP BY hypervisor, hypervisor_version
       ORDER BY failure_count DESC`
    );
    
    res.json({
      stats: stats[0],
      commonFailures,
      recentFailures,
      byHypervisor
    });
  } catch (error) {
    console.error('Error fetching test failures summary:', error);
    res.status(500).json({ error: 'Failed to fetch test failures summary' });
  }
});

// Get failure history for a specific test
app.get('/api/test-failures/test/:testName', async (req: Request, res: Response) => {
  try {
    const testName = decodeURIComponent(req.params.testName);
    
    // Get all occurrences
    const history = await queryWithRetry<any[]>(
      `SELECT 
        pr_number, test_file, result, time_seconds,
        hypervisor, hypervisor_version, test_date, logs_url
       FROM test_results
       WHERE test_name = ?
       ORDER BY test_date DESC`,
      [testName]
    );
    
    // Get statistics
    const stats = await queryWithRetry<any[]>(
      `SELECT 
        COUNT(*) as total_occurrences,
        COUNT(DISTINCT pr_number) as prs_affected,
        COUNT(DISTINCT CONCAT(hypervisor, '-', hypervisor_version)) as platforms,
        MIN(test_date) as first_seen,
        MAX(test_date) as last_seen,
        GROUP_CONCAT(DISTINCT hypervisor ORDER BY hypervisor) as hypervisors
       FROM test_results
       WHERE test_name = ?`,
      [testName]
    );
    
    res.json({
      test_name: testName,
      stats: stats[0],
      history
    });
  } catch (error) {
    console.error('Error fetching test failure history:', error);
    res.status(500).json({ error: 'Failed to fetch test failure history' });
  }
});

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
