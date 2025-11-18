import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

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
};

// Create database connection pool
const pool = mysql.createPool(dbConfig);
console.log('Database connection pool created');

// Types
interface SmokeTestResult {
  hypervisor: string;
  passed: number;
  total: number;
  status: 'OK' | 'FAIL';
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
  
  const [rows] = await pool.query(query);
  
  const prDataPromises = (rows as any[]).map(async (row) => {
    // Get Trillian test results for this PR
    const [trillianResults] = await pool.query(
      'SELECT hypervisor, trillian_comment, trillian_created_at FROM pr_trillian_comments WHERE pr_number = ?',
      [row.pr_number]
    );
    
    // Get codecov data
    const [codecovResults] = await pool.query(
      'SELECT codecov_comment, codecov_created_at FROM pr_codecov_comments WHERE pr_number = ? LIMIT 1',
      [row.pr_number]
    );
    
    // Parse smoke tests from Trillian comments
    const smokeTests: SmokeTestResult[] = (trillianResults as any[])
      .map((tr: any) => {
        const comment = tr.trillian_comment || '';
        let passed = 0;
        let total = 0;
        
        // Parse "141 look OK, 0 have errors" pattern
        const okMatch = comment.match(/(\d+)\s+look\s+OK/i);
        const errorMatch = comment.match(/(\d+)\s+have\s+errors/i);
        
        if (okMatch) passed = parseInt(okMatch[1]);
        if (errorMatch && okMatch) total = passed + parseInt(errorMatch[1]);
        
        // Only return if we found actual test results
        if (okMatch && total > 0) {
          return {
            hypervisor: tr.hypervisor?.toUpperCase() || 'UNKNOWN',
            passed,
            total,
            status: (errorMatch && parseInt(errorMatch[1]) > 0) ? 'FAIL' : 'OK'
          };
        }
        return null;
      })
      .filter((test): test is SmokeTestResult => test !== null);
    
    // Extract logs URL from Trillian comment
    let logsUrl: string | undefined;
    const trillianArray = trillianResults as any[];
    if (trillianArray.length > 0) {
      const comment = trillianArray[0].trillian_comment || '';
      const logsMatch = comment.match(/https:\/\/[^\s)]+\.zip/i);
      if (logsMatch) logsUrl = logsMatch[0];
    }
    
    return {
      number: row.pr_number,
      title: row.pr_title,
      url: `https://github.com/apache/cloudstack/pull/${row.pr_number}`,
      createdAt: row.inserted_at,
      updatedAt: row.inserted_at,
      approvals: {
        approved: 0,
        changesRequested: 0,
        commented: 0,
      },
      smokeTests,
      logsUrl,
    };
  });
  
  return await Promise.all(prDataPromises);
}

async function getPRFromDatabase(prNumber: number): Promise<PRData | null> {
  const [rows] = await pool.query(
    'SELECT pr_number, pr_title, pr_state, inserted_at FROM pr_health_labels WHERE pr_number = ? AND label_name = ? LIMIT 1',
    [prNumber, 'type:healthcheckrun']
  );
  const rowsArray = rows as any[];
  
  if (rowsArray.length === 0) {
    return null;
  }

  const row = rowsArray[0];
  
  // Get Trillian test results
  const [trillianResults] = await pool.query(
    'SELECT hypervisor, trillian_comment, trillian_created_at FROM pr_trillian_comments WHERE pr_number = ?',
    [prNumber]
  );
  
  // Parse smoke tests
  const smokeTests: SmokeTestResult[] = (trillianResults as any[])
    .map((tr: any) => {
      const comment = tr.trillian_comment || '';
      let passed = 0;
      let total = 0;
      
      const okMatch = comment.match(/(\d+)\s+look\s+OK/i);
      const errorMatch = comment.match(/(\d+)\s+have\s+errors/i);
      
      if (okMatch) passed = parseInt(okMatch[1]);
      if (errorMatch && okMatch) total = passed + parseInt(errorMatch[1]);
      
      // Only return if we found actual test results
      if (okMatch && total > 0) {
        return {
          hypervisor: tr.hypervisor?.toUpperCase() || 'UNKNOWN',
          passed,
          total,
          status: (errorMatch && parseInt(errorMatch[1]) > 0) ? 'FAIL' : 'OK'
        };
      }
      return null;
    })
    .filter((test): test is SmokeTestResult => test !== null);
  
  let logsUrl: string | undefined;
  const trillianArray = trillianResults as any[];
  if (trillianArray.length > 0) {
    const comment = trillianArray[0].trillian_comment || '';
    const logsMatch = comment.match(/https:\/\/[^\s)]+\.zip/i);
    if (logsMatch) logsUrl = logsMatch[0];
  }
  
  return {
    number: row.pr_number,
    title: row.pr_title,
    url: `https://github.com/apache/cloudstack/pull/${row.pr_number}`,
    createdAt: row.inserted_at,
    updatedAt: row.inserted_at,
    approvals: {
      approved: 0,
      changesRequested: 0,
      commented: 0,
    },
    smokeTests,
    logsUrl,
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
  
  const [rows] = await pool.query(query, params);
  return rows as UpgradeTestResult[];
}

async function getUpgradeTestFilters() {
  const [versions] = await pool.query(
    'SELECT DISTINCT upgrade_start_version, upgrade_target_version FROM upgrade_test_results WHERE upgrade_start_version IS NOT NULL AND upgrade_target_version IS NOT NULL ORDER BY upgrade_start_version DESC'
  );
  
  const [distros] = await pool.query(
    'SELECT DISTINCT management_server_os FROM upgrade_test_results WHERE management_server_os IS NOT NULL ORDER BY management_server_os'
  );
  
  const [hypervisors] = await pool.query(
    'SELECT DISTINCT hypervisor FROM upgrade_test_results WHERE hypervisor IS NOT NULL ORDER BY hypervisor'
  );
  
  return {
    versions: versions as any[],
    distros: (distros as any[]).map((d: any) => d.management_server_os),
    hypervisors: (hypervisors as any[]).map((h: any) => h.hypervisor),
  };
}

async function getUpgradeTestStats() {
  const [stats] = await pool.query(`
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
  
  return (stats as any[])[0];
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
