#!/usr/bin/env node

/**
 * GitHub PR Scraper for Apache CloudStack
 * 
 * This script scrapes PR data from GitHub including:
 * - Code coverage comments (codecov)
 * - LGTM approvals/reviews/comments
 * - Smoketest results per hypervisor (Trillian)
 * - PR state changes (open -> closed)
 * 
 * Usage: node scrape-github-prs.js [--pr-number=12345] [--all]
 */

const https = require('https');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

// Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO_OWNER = 'apache';
const REPO_NAME = 'cloudstack';

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cloudstack_tests',
};

// GitHub API helper
function githubRequest(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: path,
      method: method,
      headers: {
        'User-Agent': 'CloudStack-PR-Scraper',
        'Accept': 'application/vnd.github.v3+json',
      },
    };

    if (GITHUB_TOKEN) {
      options.headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    } else {
      console.warn('⚠️  WARNING: No GitHub token found - will hit rate limits quickly!');
    }

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Fetch open PRs
async function fetchOpenPRs() {
  console.log('Fetching open PRs...');
  let allPRs = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const prs = await githubRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open&per_page=100&page=${page}`);
    allPRs = allPRs.concat(prs);
    
    // If we got less than 100, we're on the last page
    if (prs.length < 100) {
      hasMore = false;
    } else {
      page++;
      // Small delay between page requests to be nice to GitHub API
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log(`Found ${allPRs.length} open PRs across ${page} page(s)`);
  return allPRs;
}

// Fetch PR reviews
async function fetchPRReviews(prNumber) {
  const reviews = await githubRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}/reviews`);
  return reviews;
}

// Fetch PR comments (issue comments)
async function fetchPRComments(prNumber) {
  const comments = await githubRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/issues/${prNumber}/comments`);
  return comments;
}

// Fetch PR details
async function fetchPRDetails(prNumber) {
  const pr = await githubRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}`);
  return pr;
}

// Parse codecov comment
function parseCodecovComment(comment) {
  const body = comment.body || '';
  
  // Check if it's a codecov comment
  if (!body.toLowerCase().includes('codecov') && !comment.user.login.includes('codecov')) {
    return null;
  }

  return {
    comment: body,
    created_at: comment.created_at,
    present: true,
  };
}

// Parse Trillian/smoke test comment
function parseTrillianComment(comment) {
  const body = comment.body || '';
  
  // Check if it's a Trillian test result comment
  if (!body.includes('Trillian test result') && !body.includes('look OK')) {
    return null;
  }

  // Extract hypervisor from comment
  let hypervisor = null;
  const hvMatch = body.match(/Environment:\s*(\w+)/i);
  if (hvMatch) {
    hypervisor = hvMatch[1].toLowerCase();
  }

  // Extract logs URL
  let logsUrl = null;
  const logsMatch = body.match(/Marvin logs:\s*(https:\/\/[^\s]+)/i);
  if (logsMatch) {
    logsUrl = logsMatch[1];
  }

  // Extract version from logs URL if available
  // URL pattern: pr12098-t14865-kvm-ol8.zip -> extract "ol8"
  // URL pattern: pr12098-t14865-vmware-70u3.zip -> extract "70u3"
  let version = null;
  if (logsUrl) {
    const urlVersionMatch = logsUrl.match(/-(kvm|vmware|xenserver|xen)-([^.]+)\.zip/i);
    if (urlVersionMatch) {
      version = urlVersionMatch[2]; // Extract the version part (ol8, ubuntu22, 70u3, etc.)
    }
  }

  return {
    hypervisor: hypervisor,
    version: version,
    comment: body,
    created_at: comment.created_at,
    present: true,
    logs_url: logsUrl,
  };
}

// Store PR approvals
async function storePRApprovals(connection, prNumber, prTitle, reviews) {
  for (const review of reviews) {
    if (review.state && review.state !== 'PENDING' && review.state !== 'DISMISSED') {
      // Convert ISO 8601 to MySQL datetime format
      const submittedAt = review.submitted_at ? new Date(review.submitted_at).toISOString().slice(0, 19).replace('T', ' ') : null;
      
      await connection.execute(
        `INSERT INTO pr_approvals (pr_number, pr_title, approver_login, approval_state, approval_created_at) 
         VALUES (?, ?, ?, ?, ?) 
         ON DUPLICATE KEY UPDATE 
           pr_title = VALUES(pr_title),
           approval_state = VALUES(approval_state),
           approval_created_at = VALUES(approval_created_at)`,
        [prNumber, prTitle, review.user.login, review.state, submittedAt]
      );
    }
  }

  // Also ensure this PR exists in pr_states (initially assume open)
  await connection.execute(
    `INSERT INTO pr_states (pr_number, pr_title, pr_state, last_checked) 
     VALUES (?, ?, 'open', NOW()) 
     ON DUPLICATE KEY UPDATE 
       pr_title = VALUES(pr_title),
       last_checked = NOW()`,
    [prNumber, prTitle]
  );

  console.log(`  Stored/updated ${reviews.filter(r => r.state && r.state !== 'PENDING' && r.state !== 'DISMISSED').length} reviews/approvals`);
}

// Store codecov comment
async function storeCodecovComment(connection, prNumber, prTitle, codecovData) {
  if (!codecovData) {
    // Mark as not present
    await connection.execute(
      'INSERT INTO pr_codecov_comments (pr_number, pr_title, codecov_present) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE codecov_present = 0',
      [prNumber, prTitle]
    );
    return;
  }

  // Convert ISO 8601 to MySQL datetime format
  const createdAt = codecovData.created_at ? new Date(codecovData.created_at).toISOString().slice(0, 19).replace('T', ' ') : null;

  await connection.execute(
    'INSERT INTO pr_codecov_comments (pr_number, pr_title, codecov_comment, codecov_created_at, codecov_present) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE codecov_comment = VALUES(codecov_comment), codecov_created_at = VALUES(codecov_created_at), codecov_present = VALUES(codecov_present)',
    [prNumber, prTitle, codecovData.comment, createdAt, codecovData.present]
  );

  console.log(`  Stored codecov comment`);
}

// Store Trillian comments
async function storeTrillianComments(connection, prNumber, prTitle, trillianComments) {
  for (const trillian of trillianComments) {
    // Convert ISO 8601 to MySQL datetime format
    const createdAt = trillian.created_at ? new Date(trillian.created_at).toISOString().slice(0, 19).replace('T', ' ') : null;
    
    await connection.execute(
      `INSERT INTO pr_trillian_comments (pr_number, pr_title, hypervisor, version, trillian_comment, trillian_created_at, trillian_present, logs_url) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE 
         pr_title = VALUES(pr_title),
         version = VALUES(version),
         trillian_comment = VALUES(trillian_comment),
         trillian_created_at = VALUES(trillian_created_at),
         trillian_present = VALUES(trillian_present),
         logs_url = VALUES(logs_url)`,
      [prNumber, prTitle, trillian.hypervisor, trillian.version, trillian.comment, createdAt, trillian.present, trillian.logs_url]
    );
  }

  console.log(`  Stored/updated ${trillianComments.length} Trillian test results`);
  
  // Parse and store test failures
  await storeTestFailures(connection, prNumber, trillianComments);
}

// Parse test failures from Trillian comment
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

// Store test failures
async function storeTestFailures(connection, prNumber, trillianComments) {
  let totalStored = 0;
  
  for (const trillian of trillianComments) {
    const failures = parseTestFailures(trillian.comment);
    
    if (failures.length > 0) {
      const createdAt = trillian.created_at ? new Date(trillian.created_at).toISOString().slice(0, 19).replace('T', ' ') : null;
      
      for (const failure of failures) {
        // Check if already exists to prevent duplicates (including test_date)
        const [existing] = await connection.execute(
          `SELECT id FROM test_results 
           WHERE pr_number = ? 
             AND test_name = ? 
             AND hypervisor <=> ? 
             AND hypervisor_version <=> ?
             AND test_date <=> ?
           LIMIT 1`,
          [prNumber, failure.test_name, trillian.hypervisor, trillian.version, createdAt]
        );
        
        if (existing.length === 0) {
          await connection.execute(
            `INSERT INTO test_results 
             (pr_number, test_name, test_file, result, time_seconds, 
              hypervisor, hypervisor_version, test_date, logs_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              prNumber,
              failure.test_name,
              failure.test_file,
              failure.result,
              failure.time_seconds,
              trillian.hypervisor,
              trillian.version,
              createdAt,
              trillian.logs_url
            ]
          );
          totalStored++;
        }
      }
    }
  }
  
  if (totalStored > 0) {
    console.log(`  Stored ${totalStored} test failures`);
  }
}

// Download and parse Trillian test results from zip files
async function downloadTrillianTestResults(trillianComment) {
  if (!trillianComment || !trillianComment.logs_url) {
    return null;
  }
  
  const tmpDir = `/tmp/trillian-${Date.now()}`;
  
  try {
    await execAsync(`mkdir -p ${tmpDir}`);
    const zipPath = `${tmpDir}/results.zip`;
    
    console.log(`  Downloading: ${trillianComment.logs_url}`);
    
    // Download the zip file (it's a direct download, no auth needed)
    await execAsync(`curl -sL "${trillianComment.logs_url}" -o "${zipPath}"`);
    
    // Extract zip
    await execAsync(`cd ${tmpDir} && unzip -q -o results.zip 2>/dev/null || true`);
    
    // Find all results.txt files in MarvinLogs directory
    const findResult = await execAsync(`find ${tmpDir}/MarvinLogs -type d -mindepth 1 -maxdepth 1 2>/dev/null`);
    const testDirs = findResult.stdout.trim().split('\n').filter(f => f);
    
    if (testDirs.length === 0) {
      console.log(`  No test directories found in MarvinLogs`);
      return null;
    }
    
    console.log(`  Found ${testDirs.length} test directories`);
    const allResults = [];
    
    // Parse each test directory's results.txt
    for (const testDir of testDirs) {
      const resultsFile = `${testDir}/results.txt`;
      if (fs.existsSync(resultsFile)) {
        const results = await parseTestResultsTxt(resultsFile, testDir);
        if (results && results.length > 0) {
          allResults.push(...results);
        }
      }
    }
    
    console.log(`  Parsed ${allResults.length} total test results`);
    return allResults.length > 0 ? allResults : null;
  } catch (error) {
    console.log(`  Error downloading Trillian results: ${error.message}`);
    return null;
  } finally {
    // Clean up temp directory
    try {
      await execAsync(`rm -rf ${tmpDir}`);
      console.log(`  Cleaned up temp directory`);
    } catch (err) {
      // Ignore cleanup errors
    }
  }
}

// Parse results.txt files from MarvinLogs
async function parseTestResultsTxt(resultsFile, testDir) {
  try {
    const content = fs.readFileSync(resultsFile, 'utf8');
    const testDirName = path.basename(testDir);
    
    // Extract test file name from directory name (e.g., test_network_X4YNJS -> test_network.py)
    // The directory format is typically: test_name_RANDOMID
    const match = testDirName.match(/^(.+)_[A-Z0-9]{6}$/);
    const testFileName = match ? match[1] : testDirName;
    
    const results = [];
    
    // Parse the summary line at the end
    // Format: "Ran X tests in Y.Zs"
    const ranMatch = content.match(/^Ran (\d+) tests? in ([\d.]+)s/m);
    if (!ranMatch) {
      return [];
    }
    
    const totalTests = parseInt(ranMatch[1]);
    const totalTime = parseFloat(ranMatch[2]);
    
    // Parse result line
    // OK = all passed
    // OK (SKIP=X) = all passed, some skipped
    // FAILED (failures=X) = some failed
    // FAILED (errors=X) = some errored
    // FAILED (failures=X, errors=Y) = some failed and errored
    const okMatch = content.match(/^OK(?:\s+\(SKIP=(\d+)\))?$/m);
    const failedMatch = content.match(/^FAILED\s+\((?:failures=(\d+))?(?:,\s*)?(?:errors=(\d+))?(?:,\s*)?(?:SKIP=(\d+))?\)/m);
    
    if (okMatch) {
      // All tests passed
      const skipCount = okMatch[1] ? parseInt(okMatch[1]) : 0;
      const passCount = totalTests - skipCount;
      
      // Extract individual test names from the output
      const testNameRegex = /^(test_\w+)\s+\([^)]+\)\s+\.\.\.\s+(SKIP|ok|OK)/gm;
      let testMatch;
      while ((testMatch = testNameRegex.exec(content)) !== null) {
        const testName = testMatch[1];
        const status = testMatch[2];
        
        results.push({
          test_name: testName,
          test_file: testFileName,
          result: status === 'SKIP' ? 'Skip' : 'Success',
          time_seconds: totalTests > 0 ? (totalTime / totalTests) : 0
        });
      }
      
      // If we couldn't extract individual tests, create aggregate result
      if (results.length === 0 && passCount > 0) {
        results.push({
          test_name: testFileName,
          test_file: testFileName,
          result: 'Success',
          time_seconds: totalTime
        });
      }
      
    } else if (failedMatch) {
      // Extract failure/error counts
      const failureCount = failedMatch[1] ? parseInt(failedMatch[1]) : 0;
      const errorCount = failedMatch[2] ? parseInt(failedMatch[2]) : 0;
      const skipCount = failedMatch[3] ? parseInt(failedMatch[3]) : 0;
      
      // Find failed test names using CRITICAL: FAILED pattern
      const failedTestRegex = /CRITICAL:\s+FAILED:\s+(\w+):/g;
      let failMatch;
      const failedTests = [];
      while ((failMatch = failedTestRegex.exec(content)) !== null) {
        failedTests.push(failMatch[1]);
      }
      
      // Find errored test names if any
      const errorTestRegex = /CRITICAL:\s+ERROR:\s+(\w+):/g;
      let errorMatch;
      const erroredTests = [];
      while ((errorMatch = errorTestRegex.exec(content)) !== null) {
        erroredTests.push(errorMatch[1]);
      }
      
      // Create results for failed tests
      for (const testName of failedTests) {
        results.push({
          test_name: testName,
          test_file: testFileName,
          result: 'Failure',
          time_seconds: totalTests > 0 ? (totalTime / totalTests) : 0
        });
      }
      
      // Create results for errored tests
      for (const erroredTests of erroredTests) {
        results.push({
          test_name: testName,
          test_file: testFileName,
          result: 'Error',
          time_seconds: totalTests > 0 ? (totalTime / totalTests) : 0
        });
      }
      
      // Also add passed tests
      const passedTestRegex = /^(test_\w+)\s+\([^)]+\)\s+\.\.\.\s+ok/gm;
      let passMatch;
      while ((passMatch = passedTestRegex.exec(content)) !== null) {
        const testName = passMatch[1];
        // Only add if not already in failed/errored lists
        if (!failedTests.includes(testName) && !erroredTests.includes(testName)) {
          results.push({
            test_name: testName,
            test_file: testFileName,
            result: 'Success',
            time_seconds: totalTests > 0 ? (totalTime / totalTests) : 0
          });
        }
      }
      
      // If we couldn't parse individual tests, create aggregate
      if (results.length === 0) {
        const avgTime = totalTests > 0 ? (totalTime / totalTests) : totalTime;
        if (failureCount > 0) {
          results.push({
            test_name: testFileName,
            test_file: testFileName,
            result: 'Failure',
            time_seconds: avgTime
          });
        }
        if (errorCount > 0) {
          results.push({
            test_name: testFileName,
            test_file: testFileName,
            result: 'Error',
            time_seconds: avgTime
          });
        }
      }
    }
    
    return results;
  } catch (error) {
    console.log(`  Could not parse ${resultsFile}: ${error.message}`);
    return [];
  }
}

// Store test results from artifacts (includes Success results)
async function storeArtifactTestResults(connection, prNumber, results, hypervisor, hypervisorVersion, testDate) {
  let totalStored = 0;
  
  // Convert ISO date to MySQL datetime format
  let mysqlDate = testDate;
  if (testDate && testDate.includes('T')) {
    mysqlDate = testDate.replace('T', ' ').replace('Z', '').substring(0, 19);
  }
  
  for (const result of results) {
    try {
      // Check if this exact test result already exists
      const [existing] = await connection.execute(
        `SELECT id FROM test_results 
         WHERE pr_number = ? 
           AND test_name = ? 
           AND test_file <=> ? 
           AND hypervisor <=> ? 
           AND hypervisor_version <=> ? 
           AND test_date = ?
         LIMIT 1`,
        [
          prNumber,
          result.test_name,
          result.test_file,
          hypervisor,
          hypervisorVersion,
          mysqlDate
        ]
      );
      
      if (existing.length > 0) {
        // Already exists, skip or update
        await connection.execute(
          `UPDATE test_results 
           SET result = ?, time_seconds = ?
           WHERE id = ?`,
          [result.result, result.time_seconds, existing[0].id]
        );
      } else {
        // Insert new record
        await connection.execute(
          `INSERT INTO test_results 
           (pr_number, test_name, test_file, result, time_seconds, hypervisor, hypervisor_version, test_date, logs_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          [
            prNumber,
            result.test_name,
            result.test_file,
            result.result,
            result.time_seconds,
            hypervisor,
            hypervisorVersion,
            mysqlDate
          ]
        );
      }
      totalStored++;
    } catch (err) {
      console.log(`  Warning: Could not store result for ${result.test_name}: ${err.message}`);
    }
  }
  
  if (totalStored > 0) {
    console.log(`  Stored ${totalStored} test results (${results.filter(r => r.result === 'Success').length} Success, ${results.filter(r => r.result === 'Failure').length} Failure, ${results.filter(r => r.result === 'Error').length} Error)`);
  }
  
  return totalStored;
}

// Update PR health labels
async function updatePRHealthLabels(connection, prNumber, prTitle, labels, state, assignees = []) {
  // Delete existing labels for this PR
  await connection.execute('DELETE FROM pr_health_labels WHERE pr_number = ?', [prNumber]);

  if (labels.length > 0) {
    for (const label of labels) {
      await connection.execute(
        'INSERT INTO pr_health_labels (pr_number, pr_title, label_name, pr_state) VALUES (?, ?, ?, ?)',
        [prNumber, prTitle, label.name, state]
      );
    }
  } else {
    // Insert a single row with NULL label for PRs with no labels
    // This ensures the PR appears in queries that use pr_health_labels
    await connection.execute(
      'INSERT INTO pr_health_labels (pr_number, pr_title, label_name, pr_state) VALUES (?, ?, ?, ?)',
      [prNumber, prTitle, null, state]
    );
  }

  // Store assignees as JSON string
  const assigneesJson = JSON.stringify(assignees);

  // Also update pr_states table for ALL PRs (not just health check labeled ones)
  await connection.execute(
    `INSERT INTO pr_states (pr_number, pr_title, pr_state, assignees, last_checked) 
     VALUES (?, ?, ?, ?, NOW()) 
     ON DUPLICATE KEY UPDATE 
       pr_title = VALUES(pr_title),
       pr_state = VALUES(pr_state),
       assignees = VALUES(assignees),
       last_checked = NOW()`,
    [prNumber, prTitle, state, assigneesJson]
  );

  console.log(`  Updated labels (${labels.length} labels, state: ${state}, assignees: ${assignees.length})`);
}

// Process a single PR
async function processPR(connection, prNumber, forceUpdate = false) {
  console.log(`\nProcessing PR #${prNumber}...`);

  try {
    // Fetch PR details
    const pr = await fetchPRDetails(prNumber);
    const prTitle = pr.title;
    const prState = pr.state; // 'open' or 'closed'
    const assignees = (pr.assignees || []).map(a => a.login);

    console.log(`  Title: ${prTitle}`);
    console.log(`  State: ${prState}`);
    console.log(`  Assignees: ${assignees.length > 0 ? assignees.join(', ') : 'None'}`);

    // Update PR labels and state
    await updatePRHealthLabels(connection, prNumber, prTitle, pr.labels || [], prState, assignees);

    // Fetch reviews
    const reviews = await fetchPRReviews(prNumber);
    await storePRApprovals(connection, prNumber, prTitle, reviews);

    // Fetch comments
    const comments = await fetchPRComments(prNumber);
    
    // Parse codecov comment (usually from codecov bot)
    let codecovData = null;
    for (const comment of comments) {
      const parsed = parseCodecovComment(comment);
      if (parsed) {
        codecovData = parsed;
        break; // Take the first one
      }
    }
    await storeCodecovComment(connection, prNumber, prTitle, codecovData);

    // Parse Trillian comments
    const trillianComments = [];
    for (const comment of comments) {
      const parsed = parseTrillianComment(comment);
      if (parsed) {
        trillianComments.push(parsed);
      }
    }
    await storeTrillianComments(connection, prNumber, prTitle, trillianComments);
    
    // Download and parse full test results from Trillian zip files
    for (const trillian of trillianComments) {
      if (trillian.logs_url) {
        console.log(`  Downloading full test results for ${trillian.hypervisor}-${trillian.version}...`);
        const fullResults = await downloadTrillianTestResults(trillian);
        
        if (fullResults && fullResults.length > 0) {
          await storeArtifactTestResults(
            connection,
            prNumber,
            fullResults,
            trillian.hypervisor,
            trillian.version,
            trillian.created_at
          );
        }
      }
    }

    console.log(`  ✓ PR #${prNumber} processed successfully`);
  } catch (error) {
    console.error(`  ✗ Error processing PR #${prNumber}:`, error.message);
  }
}

// Handle state changes for closed PRs
async function handleClosedPRs(connection) {
  console.log('\nChecking for state changes in tracked PRs...');

  // Get all PRs currently marked as 'open' in our database from both tables
  const [healthOpenPRs] = await connection.execute(
    'SELECT DISTINCT pr_number FROM pr_health_labels WHERE pr_state = ?',
    ['open']
  );
  
  const [statesOpenPRs] = await connection.execute(
    'SELECT DISTINCT pr_number FROM pr_states WHERE pr_state = ?',
    ['open']
  );

  console.log(`  pr_health_labels: ${healthOpenPRs.length} open PRs`);
  console.log(`  pr_states: ${statesOpenPRs.length} open PRs`);

  // Combine and deduplicate PR numbers
  const allOpenPRNumbers = new Set([
    ...healthOpenPRs.map(row => row.pr_number),
    ...statesOpenPRs.map(row => row.pr_number)
  ]);

  console.log(`Found ${allOpenPRNumbers.size} PRs marked as open in database (combined unique)`);

  for (const prNumber of allOpenPRNumbers) {
    try {
      // Check actual state on GitHub
      const pr = await fetchPRDetails(prNumber);
      
      if (pr.state === 'closed') {
        console.log(`  PR #${prNumber} is now closed, updating state...`);
        await connection.execute(
          'UPDATE pr_health_labels SET pr_state = ? WHERE pr_number = ?',
          ['closed', prNumber]
        );
        // Also update pr_states table to keep it in sync
        await connection.execute(
          'UPDATE pr_states SET pr_state = ?, last_checked = NOW() WHERE pr_number = ?',
          ['closed', prNumber]
        );
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`  Error checking PR #${prNumber}:`, error.message);
    }
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const prNumberArg = args.find(arg => arg.startsWith('--pr-number='));
  const allFlag = args.includes('--all');

  // Log token status at startup
  console.log('🔑 GitHub Token:', GITHUB_TOKEN ? `Loaded (${GITHUB_TOKEN.substring(0, 7)}...)` : '❌ NOT FOUND');
  
  let connection;

  try {
    // Connect to database
    console.log('Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('Database connected\n');

    if (prNumberArg) {
      // Process specific PR
      const prNumber = parseInt(prNumberArg.split('=')[1]);
      await processPR(connection, prNumber, true);
    } else if (allFlag) {
      console.log('Processing ALL open PRs (this may take a while)...');
      const prs = await fetchOpenPRs();
      
      for (let i = 0; i < prs.length; i++) {
        await processPR(connection, prs[i].number);
        // Add delay to avoid rate limiting
        if (i < prs.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } else {
      // Default: Process open PRs
      const prs = await fetchOpenPRs();
      
      for (let i = 0; i < prs.length; i++) {
        await processPR(connection, prs[i].number);
        // Add delay to avoid rate limiting
        if (i < prs.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Check for state changes
      await handleClosedPRs(connection);
    }

    console.log('\n✓ Scraping completed successfully');
  } catch (error) {
    console.error('\n✗ Fatal error:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
}

// Run the script
main();
