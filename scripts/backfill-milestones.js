#!/usr/bin/env node

/**
 * Backfill Milestones Script
 * 
 * This script populates the milestone field for ALL existing open PRs in pr_states table.
 * Run this ONCE after adding the milestone column to the database.
 * 
 * Usage: 
 *   node scripts/backfill-milestones.js                  # Dry run (preview only)
 *   node scripts/backfill-milestones.js --execute        # Actually update database (ALL PRs)
 *   node scripts/backfill-milestones.js --execute --force-partial  # Process what you can with remaining API rate limit
 * 
 * Note: Processes ALL open PRs in the database (not limited to 50).
 *       Requires sufficient GitHub API rate limit (check with dry run first).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const axios = require('axios');
const mysql = require('mysql2/promise');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cloudstack_tests',
};

const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'apache';
const REPO_NAME = 'cloudstack';
const DELAY_MS = 200;

const DRY_RUN = !process.argv.includes('--execute');

// GitHub API with auth
const githubApi = axios.create({
  baseURL: GITHUB_API,
  headers: GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {},
});

async function fetchPRMilestone(prNumber) {
  try {
    const response = await githubApi.get(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}`);
    const milestone = response.data.milestone?.title || null;
    return milestone;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(`   ⚠️  PR #${prNumber} not found (may be deleted)`);
      return null;
    }
    if (error.response && error.response.status === 403) {
      console.error(`   ❌ Rate limit hit for PR #${prNumber}`);
      throw new Error('Rate limit exceeded');
    }
    console.error(`   ❌ Error fetching PR #${prNumber}:`, error.message);
    return null;
  }
}

async function checkRateLimit() {
  try {
    const response = await githubApi.get('/rate_limit');
    const remaining = response.data.rate.remaining;
    const resetTime = new Date(response.data.rate.reset * 1000);
    console.log(`\n📊 GitHub API Rate Limit:`);
    console.log(`   Remaining: ${remaining} requests`);
    console.log(`   Resets at: ${resetTime.toLocaleString()}`);
    return remaining;
  } catch (error) {
    console.log('⚠️  Could not check rate limit');
    return null;
  }
}

async function main() {
  console.log('🔄 Milestone Backfill Script\n');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (preview only)' : '✍️  EXECUTE (will update database)'}`);
  console.log(`Token: ${GITHUB_TOKEN ? '✅ Set' : '❌ Not set'}\n`);
  
  if (!GITHUB_TOKEN) {
    console.error('❌ ERROR: GITHUB_TOKEN not set. This script requires a token to avoid rate limits.\n');
    process.exit(1);
  }

  const connection = await mysql.createConnection(DB_CONFIG);
  
  try {
    // Check rate limit first
    const rateLimitRemaining = await checkRateLimit();
    
    // Get count of open PRs to check against rate limit
    const [countResult] = await connection.query(`
      SELECT COUNT(*) as count FROM pr_states WHERE pr_state = 'open'
    `);
    const totalPRs = countResult[0].count;
    
    console.log(`\nTotal open PRs to process: ${totalPRs}`);
    
    if (rateLimitRemaining !== null && rateLimitRemaining < totalPRs) {
      console.log(`\n⚠️  WARNING: Only ${rateLimitRemaining} API requests remaining!`);
      console.log(`   You need ${totalPRs} requests to process all PRs.`);
      console.log(`   Either wait for rate limit reset or process in batches.\n`);
      
      const shouldContinue = process.argv.includes('--force-partial');
      if (!shouldContinue) {
        console.log(`   Run with --force-partial to process what you can (${rateLimitRemaining} PRs)`);
        process.exit(1);
      }
    }

    // Check if milestone column exists
    const [columns] = await connection.query(
      `SHOW COLUMNS FROM pr_states LIKE 'milestone'`
    );
    
    if (columns.length === 0) {
      console.error('\n❌ ERROR: milestone column does not exist in pr_states table!');
      console.error('   Run this SQL first: ALTER TABLE pr_states ADD COLUMN milestone VARCHAR(100) DEFAULT NULL;\n');
      process.exit(1);
    }
    
    console.log('✅ milestone column exists in pr_states table\n');

    // Get all open PRs (no limit - process all)
    const [openPRs] = await connection.query(`
      SELECT pr_number, milestone 
      FROM pr_states 
      WHERE pr_state = 'open'
      ORDER BY pr_number DESC
    `);
    
    console.log(`Found ${openPRs.length} open PRs to process\n`);
    
    if (openPRs.length === 0) {
      console.log('✅ No open PRs to process. Done!\n');
      return;
    }

    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const stats = {
      withMilestone: 0,
      withoutMilestone: 0,
      alreadySet: 0,
    };

    for (const row of openPRs) {
      const prNumber = row.pr_number;
      const currentMilestone = row.milestone;
      
      // Skip if already has milestone (unless we're forcing update)
      if (currentMilestone && !process.argv.includes('--force')) {
        console.log(`PR #${prNumber}: ⏭️  Skipped (already has milestone: ${currentMilestone})`);
        stats.alreadySet++;
        skipped++;
        continue;
      }

      try {
        const milestone = await fetchPRMilestone(prNumber);
        
        if (milestone) {
          console.log(`PR #${prNumber}: ✅ Found milestone: ${milestone}`);
          stats.withMilestone++;
          
          if (!DRY_RUN) {
            await connection.execute(
              'UPDATE pr_states SET milestone = ? WHERE pr_number = ?',
              [milestone, prNumber]
            );
          }
          updated++;
        } else {
          console.log(`PR #${prNumber}: ⚪ No milestone`);
          stats.withoutMilestone++;
          
          if (!DRY_RUN) {
            // Explicitly set to NULL to mark as checked
            await connection.execute(
              'UPDATE pr_states SET milestone = NULL WHERE pr_number = ?',
              [prNumber]
            );
          }
          updated++;
        }
        
        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        
      } catch (error) {
        console.error(`PR #${prNumber}: ❌ Error: ${error.message}`);
        errors++;
        
        // If rate limited, stop
        if (error.message.includes('Rate limit')) {
          console.log('\n⚠️  Stopping due to rate limit. Run again later.\n');
          break;
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log('='.repeat(60));
    console.log(`Total PRs processed:     ${openPRs.length}`);
    console.log(`PRs with milestone:      ${stats.withMilestone}`);
    console.log(`PRs without milestone:   ${stats.withoutMilestone}`);
    console.log(`Already had milestone:   ${stats.alreadySet}`);
    console.log(`Errors:                  ${errors}`);
    
    if (DRY_RUN) {
      console.log('\n🔍 This was a DRY RUN - no changes were made.');
      console.log('   Run with --execute flag to actually update the database.\n');
    } else {
      console.log(`\n✅ Updated ${updated} PRs in database.\n`);
    }
    
    // Check rate limit after
    await checkRateLimit();
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

main().catch(console.error);
