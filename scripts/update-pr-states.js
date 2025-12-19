#!/usr/bin/env node

/**
 * Update PR states from GitHub
 * This script checks all PRs in the database and updates their state (open/closed/merged)
 * Handles rate limiting gracefully with batching and delay options
 */

const path = require('path');
// Load environment variables from server/.env file
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const axios = require('axios');
const mysql = require('mysql2/promise');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const DB_CONFIG = {
  host: '10.0.113.145',
  user: 'results',
  password: 'P@ssword123',
  database: 'cloudstack_tests',
};

const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'apache';
const REPO_NAME = 'cloudstack';

// Batch size (how many PRs to check per run)
const BATCH_SIZE = parseInt(process.argv[2]) || 50; // Default to 50 PRs per run
const DELAY_MS = GITHUB_TOKEN ? 200 : 1000; // Longer delay if no token

// GitHub API with auth
const githubApi = axios.create({
  baseURL: GITHUB_API,
  headers: GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {},
});

async function fetchPRState(prNumber) {
  try {
    const response = await githubApi.get(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}`);
    const assignees = (response.data.assignees || []).map(a => a.login);
    return { 
      state: response.data.state, // 'open' or 'closed'
      assignees: assignees
    };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return { state: 'closed', assignees: [] }; // PR not found, likely deleted or closed
    }
    if (error.response && error.response.status === 429) {
      console.error(`⚠️  Rate limit hit for PR #${prNumber}. Stop and run again later with a token.`);
      return null;
    }
    console.error(`Error fetching PR #${prNumber}:`, error.message);
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
    console.log('⚠️  Could not check rate limit (no token?)');
    return null;
  }
}

async function main() {
  console.log('🔄 Starting PR state update...');
  console.log(`   Batch size: ${BATCH_SIZE} PRs`);
  console.log(`   Delay: ${DELAY_MS}ms between requests`);
  console.log(`   Token: ${GITHUB_TOKEN ? '✅ Set' : '❌ Not set (will hit rate limits!)'}\n`);
  
  const connection = await mysql.createConnection(DB_CONFIG);
  
  try {
    // Check rate limit first
    const rateLimitRemaining = await checkRateLimit();
    
    if (rateLimitRemaining !== null && rateLimitRemaining < BATCH_SIZE) {
      console.log(`\n⚠️  WARNING: Only ${rateLimitRemaining} requests remaining!`);
      console.log(`   Consider reducing batch size or waiting for rate limit reset.\n`);
    }
    
    // Get open PRs that haven't been checked recently (oldest first)
    const [openPRs] = await connection.query(`
      SELECT pr_number, pr_state, last_checked 
      FROM pr_states 
      WHERE pr_state = 'open'
      ORDER BY last_checked ASC
      LIMIT ?
    `, [BATCH_SIZE]);
    
    console.log(`Found ${openPRs.length} PRs to check (oldest first)\n`);
    
    let updated = 0;
    let stillOpen = 0;
    let errors = 0;
    let rateLimited = false;
    
    for (let i = 0; i < openPRs.length; i++) {
      const row = openPRs[i];
      const prNumber = row.pr_number;
      const currentState = row.pr_state;
      
      console.log(`[${i + 1}/${openPRs.length}] Checking PR #${prNumber}...`);
      
      // Fetch actual state from GitHub
      const prData = await fetchPRState(prNumber);
      
      if (!prData) {
        errors++;
        if (errors > 5) {
          // Likely hit rate limit, stop early
          console.log('\n⚠️  Too many errors (likely rate limited). Stopping early.');
          rateLimited = true;
          break;
        }
        continue;
      }
      
      const actualState = prData.state;
      const assignees = prData.assignees;
      const assigneesJson = JSON.stringify(assignees);
      
      if (actualState !== currentState) {
        console.log(`   ✅ PR #${prNumber}: ${currentState} → ${actualState}, Assignees: ${assignees.join(', ') || 'None'}`);
        
        // Update state and assignees in pr_states table
        await connection.query(
          'UPDATE pr_states SET pr_state = ?, assignees = ?, last_checked = NOW() WHERE pr_number = ?',
          [actualState, assigneesJson, prNumber]
        );
        
        // Also update pr_health_labels if it exists
        await connection.query(
          'UPDATE pr_health_labels SET pr_state = ? WHERE pr_number = ?',
          [actualState, prNumber]
        );
        
        updated++;
      } else {
        stillOpen++;
        console.log(`   Still open, Assignees: ${assignees.join(', ') || 'None'}`);
        // Update last_checked timestamp and assignees
        await connection.query(
          'UPDATE pr_states SET assignees = ?, last_checked = NOW() WHERE pr_number = ?',
          [assigneesJson, prNumber]
        );
      }
      
      // Rate limiting - sleep between requests
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
    
    console.log(`\n✅ Update complete!`);
    console.log(`   Checked: ${openPRs.length} PRs`);
    console.log(`   Updated to closed: ${updated} PRs`);
    console.log(`   Still open: ${stillOpen} PRs`);
    console.log(`   Errors: ${errors} PRs`);
    
    if (rateLimited) {
      console.log(`\n⚠️  RATE LIMITED! Run again later with a GitHub token.`);
      console.log(`   Get token: https://github.com/settings/tokens`);
      console.log(`   Then run: export GITHUB_TOKEN="your_token" && node scripts/update-pr-states.js`);
    }
    
    // Show summary
    const [summary] = await connection.query(`
      SELECT pr_state, COUNT(*) as count 
      FROM pr_states 
      GROUP BY pr_state
    `);
    
    console.log('\n📊 Current state summary:');
    summary.forEach(row => {
      console.log(`   ${row.pr_state}: ${row.count}`);
    });
    
    // Show how many still need checking
    const [unchecked] = await connection.query(`
      SELECT COUNT(*) as count
      FROM pr_states
      WHERE pr_state = 'open' 
        AND (last_checked IS NULL OR last_checked < DATE_SUB(NOW(), INTERVAL 1 DAY))
    `);
    
    if (unchecked[0].count > 0) {
      console.log(`\n💡 ${unchecked[0].count} PRs still need checking. Run again to continue.`);
    }
    
    // Final rate limit check
    await checkRateLimit();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connection.end();
  }
}

main().catch(console.error);
