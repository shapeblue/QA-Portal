import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

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
  passed: number;
  total: number;
  status: 'OK' | 'FAIL';
  logsUrl?: string;
  failedTests?: string[];
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
    ORDER BY l.inserted_at DESC
  `;
  
  const rows = await queryWithRetry<any[]>(query);
  
  if (rows.length === 0) {
    return [];
  }
  
  // Get all PR numbers
  const prNumbers = rows.map(r => r.pr_number);
  
  // Fetch all data in bulk with IN queries
  const [allTrillianResults, allCodecovResults, allReviewResults] = await Promise.all([
    queryWithRetry<any[]>(
      `SELECT pr_number, hypervisor, trillian_comment, trillian_created_at FROM pr_trillian_comments WHERE pr_number IN (${prNumbers.map(() => '?').join(',')})`,
      prNumbers
    ),
    queryWithRetry<any[]>(
      `SELECT pr_number, codecov_comment, codecov_created_at FROM pr_codecov_comments WHERE pr_number IN (${prNumbers.map(() => '?').join(',')})`,
      prNumbers
    ),
    queryWithRetry<any[]>(
      `SELECT pr_number, state FROM pr_approvals WHERE pr_number IN (${prNumbers.map(() => '?').join(',')})`,
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
  
  const prDataPromises = rows.map(async (row) => {
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
        
        // Extract logs URL for this hypervisor
        const logsMatch = comment.match(/https:\/\/[^\s)]+\.zip/i);
        const logsUrl = logsMatch ? logsMatch[0] : undefined;
        
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
          return {
            hypervisor: tr.hypervisor?.toUpperCase() || 'UNKNOWN',
            passed,
            total,
            status: (errorMatch && parseInt(errorMatch[1]) > 0) ? 'FAIL' as const : 'OK' as const,
            logsUrl,
            failedTests: failedTests.length > 0 ? failedTests : undefined
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
    
    return {
      number: row.pr_number,
      title: row.pr_title,
      url: `https://github.com/apache/cloudstack/pull/${row.pr_number}`,
      createdAt: row.inserted_at,
      updatedAt: row.inserted_at,
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
    'SELECT pr_number, pr_title, hypervisor, trillian_comment, trillian_created_at FROM pr_trillian_comments WHERE pr_number = ?',
    [prNumber]
  );
  
  if (trillianResults.length === 0) {
    return null;
  }

  // Use first result for basic PR info
  const firstResult = trillianResults[0];
  const prTitle = firstResult.pr_title || `PR #${prNumber}`;
  const insertedAt = firstResult.trillian_created_at || new Date().toISOString();
  
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
        return {
          hypervisor: tr.hypervisor?.toUpperCase() || 'UNKNOWN',
          passed,
          total,
          status: hasErrors ? 'FAIL' as const : 'OK' as const,
          logsUrl,
          // Always include failedTests array when there are errors (even if parsing failed)
          failedTests: hasErrors ? (failedTests.length > 0 ? failedTests : []) : undefined
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
  
  // Get PR approvals data
  let reviewResults: any[] = [];
  try {
    reviewResults = await queryWithRetry<any[]>(
      'SELECT state FROM pr_approvals WHERE pr_number = ?',
      [prNumber]
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
  
  return {
    number: prNumber,
    title: prTitle,
    url: `https://github.com/apache/cloudstack/pull/${prNumber}`,
    createdAt: insertedAt,
    updatedAt: insertedAt,
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
    'SELECT DISTINCT upgrade_start_version, upgrade_target_version FROM upgrade_test_results WHERE upgrade_start_version IS NOT NULL AND upgrade_target_version IS NOT NULL ORDER BY upgrade_start_version DESC'
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
  `);
  
  return stats[0];
}

// API Routes

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

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
