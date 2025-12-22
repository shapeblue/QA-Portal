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
        // Check if already exists
        const [existing] = await connection.execute(
          `SELECT id FROM test_results 
           WHERE pr_number = ? 
             AND test_name = ? 
             AND hypervisor = ?
             AND hypervisor_version = ?`,
          [prNumber, failure.test_name, trillian.hypervisor, trillian.version]
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

// Update PR health labels
async function updatePRHealthLabels(connection, prNumber, prTitle, labels, state, assignees = []) {
  // Delete existing labels for this PR
  await connection.execute('DELETE FROM pr_health_labels WHERE pr_number = ?', [prNumber]);

  for (const label of labels) {
    await connection.execute(
      'INSERT INTO pr_health_labels (pr_number, pr_title, label_name, pr_state) VALUES (?, ?, ?, ?)',
      [prNumber, prTitle, label.name, state]
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

    console.log(`  ✓ PR #${prNumber} processed successfully`);
  } catch (error) {
    console.error(`  ✗ Error processing PR #${prNumber}:`, error.message);
  }
}

// Handle state changes for closed PRs
async function handleClosedPRs(connection) {
  console.log('\nChecking for state changes in tracked PRs...');

  // Get all PRs currently marked as 'open' in our database
  const [openPRs] = await connection.execute(
    'SELECT DISTINCT pr_number FROM pr_health_labels WHERE pr_state = ?',
    ['open']
  );

  console.log(`Found ${openPRs.length} PRs marked as open in database`);

  for (const row of openPRs) {
    const prNumber = row.pr_number;
    
    try {
      // Check actual state on GitHub
      const pr = await fetchPRDetails(prNumber);
      
      if (pr.state === 'closed') {
        console.log(`  PR #${prNumber} is now closed, updating state...`);
        await connection.execute(
          'UPDATE pr_health_labels SET pr_state = ? WHERE pr_number = ?',
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
