#!/usr/bin/env node

/**
 * Backfill Package Builds Script
 * 
 * Purpose: Populate pr_package_builds table with existing BlueOrangutan
 *          package build comments from open PRs.
 * 
 * Usage:
 *   node scripts/backfill-package-builds.js           # Dry run
 *   node scripts/backfill-package-builds.js --execute # Execute
 *   node scripts/backfill-package-builds.js --execute --force-partial # Process even if rate limited
 * 
 * Based on: backfill-milestones.js
 */

const mysql = require('mysql2/promise');
const axios = require('axios');
require('dotenv').config();

const { parseLatestPackageBuild } = require('./lib/blueorangutan-parser');

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--execute');
const FORCE_PARTIAL = args.includes('--force-partial');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = 'apache';
const GITHUB_REPO = 'cloudstack';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cloudstack_tests'
};

// Statistics
let stats = {
  totalProcessed: 0,
  withPackages: 0,
  withoutPackages: 0,
  errors: 0,
  skipped: 0
};

// GitHub API helper
async function fetchFromGitHub(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    return response.data;
  } catch (error) {
    console.error(`❌ GitHub API error: ${error.message}`);
    throw error;
  }
}

// Check GitHub API rate limit
async function checkRateLimit() {
  const rateLimit = await fetchFromGitHub('https://api.github.com/rate_limit');
  return {
    remaining: rateLimit.rate.remaining,
    limit: rateLimit.rate.limit,
    reset: new Date(rateLimit.rate.reset * 1000)
  };
}

// Fetch PR details
async function fetchPRDetails(prNumber) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${prNumber}`;
  return await fetchFromGitHub(url);
}

// Fetch PR comments
async function fetchPRComments(prNumber) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${prNumber}/comments?per_page=100`;
  return await fetchFromGitHub(url);
}

// Store package build in database
async function storePackageBuild(connection, prNumber, prTitle, packageData) {
  if (!packageData) {
    return false;
  }
  
  const packagesJson = JSON.stringify(packageData.packages);
  const commentCreatedAt = new Date(packageData.createdAt);
  const headCommitDate = packageData.headCommitDate ? new Date(packageData.headCommitDate) : null;
  
  // Compute staleness (QA Issue #1 fix: use HEAD commit date)
  const isStale = headCommitDate && commentCreatedAt < headCommitDate;
  
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would insert: packages=${packagesJson}, sl_jid=${packageData.slJid}, is_stale=${isStale}`);
    return true;
  }
  
  try {
    await connection.execute(
      `INSERT INTO pr_package_builds 
        (pr_number, pr_title, packages, sl_jid, build_url, build_status,
         comment_created_at, comment_id, head_commit_sha, head_commit_date, is_stale) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         packages = VALUES(packages),
         sl_jid = VALUES(sl_jid),
         build_url = VALUES(build_url),
         build_status = VALUES(build_status),
         comment_created_at = VALUES(comment_created_at),
         head_commit_sha = VALUES(head_commit_sha),
         head_commit_date = VALUES(head_commit_date),
         is_stale = VALUES(is_stale)`,
      [
        prNumber,
        prTitle,
        packagesJson,
        packageData.slJid,
        packageData.buildUrl,
        packageData.buildStatus,
        commentCreatedAt,
        packageData.commentId,
        packageData.headCommitSha,
        headCommitDate,
        isStale
      ]
    );
    return true;
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      console.log(`  ℹ️  Package build already exists (skipping)`);
      stats.skipped++;
      return false;
    }
    throw error;
  }
}

// Process a single PR
async function processPR(connection, prNumber, prTitle) {
  try {
    // Fetch PR details (for HEAD commit info)
    const pr = await fetchPRDetails(prNumber);
    
    // Fetch comments
    const comments = await fetchPRComments(prNumber);
    
    // Parse package builds
    const packageBuild = parseLatestPackageBuild(comments, pr);
    
    if (packageBuild) {
      const packages = packageBuild.packages.join(', ');
      const statusIcon = packageBuild.buildStatus === 'success' ? '✅' : 
                        packageBuild.buildStatus === 'failed' ? '❌' : '⚠️';
      console.log(`PR #${prNumber}: ${statusIcon} Found packages: ${packages} (SL-JID ${packageBuild.slJid || 'N/A'})`);
      
      await storePackageBuild(connection, prNumber, prTitle, packageBuild);
      stats.withPackages++;
    } else {
      console.log(`PR #${prNumber}: ⚪ No package builds found`);
      stats.withoutPackages++;
    }
    
    stats.totalProcessed++;
    
    // Rate limit protection: delay between requests
    await new Promise(resolve => setTimeout(resolve, 200));
    
  } catch (error) {
    console.error(`❌ Error processing PR #${prNumber}:`, error.message);
    stats.errors++;
  }
}

// Main function
async function main() {
  console.log('\n🔄 Package Builds Backfill Script');
  console.log(`Mode: ${DRY_RUN ? '👁️  DRY RUN (no changes)' : '✍️  EXECUTE (will update database)'}`);
  console.log(`Token: ${GITHUB_TOKEN ? '✅ Set' : '❌ Missing'}\n`);
  
  if (!GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }
  
  // Check rate limit
  console.log('📊 GitHub API Rate Limit:');
  const rateLimit = await checkRateLimit();
  console.log(`   Remaining: ${rateLimit.remaining} requests`);
  console.log(`   Resets at: ${rateLimit.reset.toLocaleString()}\n`);
  
  // Connect to database
  const connection = await mysql.createConnection(dbConfig);
  console.log('✅ Connected to database\n');
  
  // Check if table exists
  const [tables] = await connection.query(
    "SHOW TABLES LIKE 'pr_package_builds'"
  );
  
  if (tables.length === 0) {
    console.error('❌ pr_package_builds table does not exist!');
    console.error('   Run migration first: mysql < scripts/migrations/001_add_package_builds_table.sql');
    await connection.end();
    process.exit(1);
  }
  
  console.log('✅ pr_package_builds table exists\n');
  
  // Fetch all open PRs
  const [openPRs] = await connection.query(
    `SELECT DISTINCT pr_number, pr_title 
     FROM pr_states 
     WHERE pr_state = 'open' 
     ORDER BY pr_number DESC`
  );
  
  const totalPRs = openPRs.length;
  console.log(`Total open PRs to process: ${totalPRs}\n`);
  
  // Check if we have enough rate limit
  const requiredRequests = totalPRs * 2; // 1 for PR details, 1 for comments
  if (rateLimit.remaining < requiredRequests && !FORCE_PARTIAL) {
    console.error(`❌ Insufficient GitHub API rate limit!`);
    console.error(`   Required: ${requiredRequests} requests`);
    console.error(`   Available: ${rateLimit.remaining} requests`);
    console.error(`   Resets at: ${rateLimit.reset.toLocaleString()}`);
    console.error(`\n   Options:`);
    console.error(`   1. Wait until rate limit resets`);
    console.error(`   2. Run with --force-partial to process what you can`);
    await connection.end();
    process.exit(1);
  }
  
  if (FORCE_PARTIAL && rateLimit.remaining < requiredRequests) {
    const canProcess = Math.floor(rateLimit.remaining / 2);
    console.log(`⚠️  WARNING: Rate limit insufficient for all PRs`);
    console.log(`   Will process first ${canProcess} of ${totalPRs} PRs\n`);
  }
  
  console.log(`Found ${totalPRs} open PRs to process\n`);
  
  // Process each PR
  for (const row of openPRs) {
    await processPR(connection, row.pr_number, row.pr_title);
  }
  
  // Summary
  console.log('\n============================================================');
  console.log('📊 Summary:');
  console.log('============================================================');
  console.log(`Total PRs processed:     ${stats.totalProcessed}`);
  console.log(`PRs with packages:       ${stats.withPackages}`);
  console.log(`PRs without packages:    ${stats.withoutPackages}`);
  console.log(`Errors:                  ${stats.errors}`);
  console.log(`Skipped (duplicates):    ${stats.skipped}`);
  
  if (!DRY_RUN) {
    console.log(`\n✅ Updated ${stats.withPackages} PRs in database.`);
  } else {
    console.log(`\n👁️  DRY RUN complete. Run with --execute to update database.`);
  }
  
  await connection.end();
}

// Run
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
