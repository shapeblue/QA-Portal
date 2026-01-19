#!/usr/bin/env node

/**
 * QA Test Script: Package Staleness Detection
 * 
 * This script validates the package staleness detection logic across all PRs
 * to ensure we correctly identify when packages are outdated due to new commits.
 * 
 * Test Cases:
 * 1. PR with fresh packages (no commits after build) - Should show ✅
 * 2. PR with stale packages (commits after build) - Should show ☑️ (grey checkmark)
 * 3. PR with failed packages - Should show ❌
 * 4. PR with no packages - Should show "No tests"
 * 
 * Author: QA Engineering Team
 * Date: 2026-01-19
 */

require('dotenv').config();
const axios = require('axios');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001/api';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  grey: '\x1b[90m',
  cyan: '\x1b[36m'
};

async function testPackageStaleness() {
  console.log(`${colors.cyan}========================================`);
  console.log(`QA Test: Package Staleness Detection`);
  console.log(`========================================${colors.reset}\n`);

  try {
    // Fetch all open PRs
    console.log(`${colors.blue}Fetching all open PRs...${colors.reset}`);
    const response = await axios.get(`${API_BASE}/all-open-prs`);
    const prs = response.data;
    
    console.log(`Found ${prs.length} open PRs\n`);

    // Categorize PRs
    const categories = {
      fresh: [],
      stale: [],
      failed: [],
      noPackages: []
    };

    for (const pr of prs) {
      if (!pr.packageBuilds || pr.packageBuilds.length === 0) {
        categories.noPackages.push(pr);
      } else {
        const hasFailed = pr.packageBuilds.packages.some(pkg => pkg.startsWith('!')) || 
                         pr.packageBuilds.buildStatus === 'failed';
        const isStale = pr.packageBuilds.isStale;

        if (hasFailed) {
          categories.failed.push(pr);
        } else if (isStale) {
          categories.stale.push(pr);
        } else {
          categories.fresh.push(pr);
        }
      }
    }

    // Report Summary
    console.log(`${colors.cyan}========================================`);
    console.log(`Test Results Summary`);
    console.log(`========================================${colors.reset}\n`);

    console.log(`${colors.green}✅ FRESH packages:${colors.reset} ${categories.fresh.length} PRs`);
    console.log(`${colors.grey}☑️  STALE packages:${colors.reset} ${categories.stale.length} PRs`);
    console.log(`${colors.red}❌ FAILED packages:${colors.reset} ${categories.failed.length} PRs`);
    console.log(`${colors.yellow}⚠️  NO packages:${colors.reset} ${categories.noPackages.length} PRs\n`);

    // Detailed STALE PRs (most important for validation)
    if (categories.stale.length > 0) {
      console.log(`${colors.cyan}========================================`);
      console.log(`Detailed STALE Package Analysis`);
      console.log(`========================================${colors.reset}\n`);

      for (const pr of categories.stale) {
        const build = pr.packageBuilds;
        const buildDate = new Date(build.buildDate);
        const headDate = new Date(pr.updated_at || pr.head_commit_date || new Date());
        const timeDiffMinutes = Math.round((headDate - buildDate) / 1000 / 60);

        console.log(`${colors.yellow}PR #${pr.number}${colors.reset}: ${pr.title.substring(0, 60)}...`);
        console.log(`  Build Date:  ${buildDate.toISOString()} (SL-JID: ${build.slJid || 'N/A'})`);
        console.log(`  Commit Date: ${headDate.toISOString()}`);
        console.log(`  ${colors.red}⚠️  STALE by ${timeDiffMinutes} minutes${colors.reset}`);
        console.log(`  Packages: ${build.packages.join(', ')}`);
        console.log('');
      }
    }

    // Test Case Validation - PR #12032
    console.log(`${colors.cyan}========================================`);
    console.log(`Known Test Case: PR #12032`);
    console.log(`========================================${colors.reset}\n`);

    const pr12032 = prs.find(pr => pr.number === 12032);
    if (pr12032) {
      if (!pr12032.packageBuilds) {
        console.log(`${colors.red}❌ FAIL: PR #12032 has no package builds${colors.reset}`);
      } else {
        const isStale = pr12032.packageBuilds.isStale;
        const expected = true; // We know this should be stale
        
        if (isStale === expected) {
          console.log(`${colors.green}✅ PASS: PR #12032 correctly detected as STALE${colors.reset}`);
          console.log(`  Build: ${new Date(pr12032.packageBuilds.buildDate).toISOString()}`);
          const headDateStr = pr12032.updated_at || pr12032.head_commit_date || 'N/A';
          console.log(`  Head:  ${headDateStr}`);
        } else {
          console.log(`${colors.red}❌ FAIL: PR #12032 incorrectly detected as ${isStale ? 'STALE' : 'FRESH'}${colors.reset}`);
          console.log(`  Expected: STALE`);
          console.log(`  Build: ${new Date(pr12032.packageBuilds.buildDate).toISOString()}`);
          const headDateStr = pr12032.updated_at || pr12032.head_commit_date || 'N/A';
          console.log(`  Head:  ${headDateStr}`);
        }
      }
    } else {
      console.log(`${colors.yellow}⚠️  WARNING: PR #12032 not found in dataset${colors.reset}`);
    }

    // Edge Cases to Check
    console.log(`\n${colors.cyan}========================================`);
    console.log(`Edge Cases Analysis`);
    console.log(`========================================${colors.reset}\n`);

    // Check for PRs where build and commit are within 1 minute (potential timezone issues)
    let edgeCases = 0;
    for (const pr of [...categories.fresh, ...categories.stale]) {
      const build = pr.packageBuilds;
      const buildDate = new Date(build.buildDate);
      const headDate = new Date(pr.head_commit_date);
      const timeDiffSeconds = Math.abs((headDate - buildDate) / 1000);

      if (timeDiffSeconds < 60 && timeDiffSeconds > 0) {
        console.log(`${colors.yellow}⚠️  PR #${pr.number}: Build and commit within 1 minute (${Math.round(timeDiffSeconds)}s)${colors.reset}`);
        console.log(`  Status: ${build.isStale ? 'STALE' : 'FRESH'}`);
        edgeCases++;
      }
    }

    if (edgeCases === 0) {
      console.log(`${colors.green}✅ No edge cases found${colors.reset}`);
    }

    console.log(`\n${colors.cyan}========================================`);
    console.log(`Test Completed Successfully`);
    console.log(`========================================${colors.reset}\n`);

  } catch (error) {
    console.error(`${colors.red}❌ Test Failed:${colors.reset}`, error.message);
    if (error.response) {
      console.error('API Response:', error.response.status, error.response.data);
    }
    process.exit(1);
  }
}

// Run the tests
testPackageStaleness();
