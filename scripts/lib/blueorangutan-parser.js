/**
 * BlueOrangutan Comment Parser
 * 
 * Addresses QA Issue #4: Parser Versioning
 * 
 * Purpose: Parse BlueOrangutan bot package build comments with versioning
 * to handle format changes gracefully.
 * 
 * Supported formats:
 * - V1: "Packaging result: ✔️ el8 and el9. SL-JID 18347"
 * - V2: "Packaging result: ✔️ el7. SL-JID 13111"
 * - V3: "Packaging result [SF]: ✔️ el8 ✔️ el9 ✔️ debian. SL-JID 16400"
 * 
 * Also handles failed builds: "❌ el8"
 */

const { validatePackageBuildData } = require('./package-validation');

/**
 * Parse BlueOrangutan comment - V1 format
 * "✔️ el8 and el9"
 */
function parseV1(body) {
  const packages = [];
  
  // Pattern: "✔️ el8 and el9"
  const andPattern = /✔️\s+(el\d+|debian|suse\d+|ubuntu\d+)\s+and\s+(el\d+|debian|suse\d+|ubuntu\d+)/gi;
  let match;
  
  while ((match = andPattern.exec(body)) !== null) {
    packages.push(match[1].toLowerCase());
    packages.push(match[2].toLowerCase());
  }
  
  // Also check for failed builds with "and"
  const failedAndPattern = /❌\s+(el\d+|debian|suse\d+|ubuntu\d+)\s+and\s+(el\d+|debian|suse\d+|ubuntu\d+)/gi;
  while ((match = failedAndPattern.exec(body)) !== null) {
    packages.push('!' + match[1].toLowerCase());
    packages.push('!' + match[2].toLowerCase());
  }
  
  return packages.length > 0 ? packages : null;
}

/**
 * Parse BlueOrangutan comment - V2 format
 * "✔️ el7" (standalone packages)
 */
function parseV2(body) {
  const packages = [];
  
  // Pattern: "✔️ el7" (standalone, not in "and" format)
  const standalonePattern = /✔️\s+(el\d+|debian|suse\d+|ubuntu\d+)(?!\s+and)/gi;
  let match;
  
  while ((match = standalonePattern.exec(body)) !== null) {
    const pkg = match[1].toLowerCase();
    // Avoid duplicates from V1
    if (!packages.includes(pkg)) {
      packages.push(pkg);
    }
  }
  
  // Failed builds
  const failedPattern = /❌\s+(el\d+|debian|suse\d+|ubuntu\d+)(?!\s+and)/gi;
  while ((match = failedPattern.exec(body)) !== null) {
    const pkg = '!' + match[1].toLowerCase();
    if (!packages.includes(pkg)) {
      packages.push(pkg);
    }
  }
  
  return packages.length > 0 ? packages : null;
}

/**
 * Parse BlueOrangutan comment - V3 format (future-proofing)
 * Multiple checkmarks: "✔️ el8 ✔️ el9 ✔️ debian"
 */
function parseV3(body) {
  // This format might be used in future, keeping parser ready
  // Currently will also be caught by V2, but having explicit V3 allows
  // for format-specific handling if bot changes
  return null; // Not implemented yet, falls back to V2
}

/**
 * Extract SL-JID from comment
 */
function extractSlJid(body) {
  const jidMatch = body.match(/SL-JID\s+(\d+)/i);
  return jidMatch ? parseInt(jidMatch[1], 10) : null;
}

/**
 * Extract build URL from comment
 */
function extractBuildUrl(body) {
  // Look for https:// or http:// URLs
  const urlMatch = body.match(/https?:\/\/[^\s)]+/);
  return urlMatch ? urlMatch[0] : null;
}

/**
 * Determine build status from packages
 * - All success (✔️): 'success'
 * - All failed (❌): 'failed'
 * - Mix: 'partial'
 */
function determineBuildStatus(packages) {
  if (!packages || packages.length === 0) return 'success';
  
  const hasSuccess = packages.some(pkg => !pkg.startsWith('!'));
  const hasFailed = packages.some(pkg => pkg.startsWith('!'));
  
  if (hasFailed && !hasSuccess) return 'failed';
  if (hasFailed && hasSuccess) return 'partial';
  return 'success';
}

/**
 * Main parser function with versioning
 * 
 * @param {Object} comment - GitHub comment object
 * @returns {Object|null} - Parsed package build data or null
 */
function parseBlueOrangutanComment(comment) {
  const body = comment.body || '';
  const username = comment.user?.login || '';
  
  // Check if it's from BlueOrangutan bot
  if (username !== 'blueorangutan') {
    return null;
  }
  
  // Check if it's a packaging result
  if (!body.includes('Packaging result')) {
    return null;
  }
  
  // Try parsers in order (newest first, then fallback)
  let packages = parseV3(body) || parseV1(body) || parseV2(body);
  
  if (!packages || packages.length === 0) {
    // Parsing failed but comment looks like packaging result
    console.error(`⚠️  ALERT: Failed to parse packaging comment`);
    console.error(`  Comment ID: ${comment.id}`);
    console.error(`  Comment body: ${body.substring(0, 200)}`);
    console.error(`  This may indicate bot format changed!`);
    return null;
  }
  
  // Remove duplicates
  packages = [...new Set(packages)];
  
  // Extract additional data
  const slJid = extractSlJid(body);
  const buildUrl = extractBuildUrl(body);
  const buildStatus = determineBuildStatus(packages);
  
  // Construct result
  const result = {
    packages,
    slJid,
    buildUrl,
    buildStatus,
    commentId: comment.id,
    createdAt: comment.created_at
  };
  
  // Note: headCommitSha and headCommitDate will be added by caller
  // (requires PR data which parser doesn't have access to)
  
  return result;
}

/**
 * Validate and prepare package build data for storage
 * 
 * @param {Object} parsedData - Parsed comment data
 * @param {Object} prData - PR data (for HEAD commit info)
 * @returns {Object} - Validated data ready for DB
 */
function preparePackageBuildData(parsedData, prData) {
  if (!parsedData) {
    throw new Error('Parsed data is required');
  }
  
  if (!prData) {
    throw new Error('PR data is required for HEAD commit info');
  }
  
  // Add HEAD commit information (QA Issue #1 fix)
  const enrichedData = {
    ...parsedData,
    headCommitSha: prData.head?.sha || null,
    headCommitDate: prData.head?.commit?.committer?.date || null
  };
  
  // Validate using validation module (QA Issue #2 fix)
  try {
    return validatePackageBuildData(enrichedData);
  } catch (error) {
    console.error(`❌ Validation failed for PR #${prData.number}:`, error.message);
    throw error;
  }
}

/**
 * Parse all package build comments from a PR
 * 
 * @param {Array} comments - Array of GitHub comments
 * @param {Object} prData - PR data
 * @returns {Object|null} - Latest package build data or null
 */
function parseLatestPackageBuild(comments, prData) {
  if (!comments || comments.length === 0) {
    return null;
  }
  
  // Parse all blueorangutan comments
  const packageBuilds = [];
  
  for (const comment of comments) {
    const parsed = parseBlueOrangutanComment(comment);
    if (parsed) {
      packageBuilds.push(parsed);
    }
  }
  
  if (packageBuilds.length === 0) {
    return null;
  }
  
  // Sort by creation date (newest first) and take the latest
  packageBuilds.sort((a, b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
  );
  
  const latestBuild = packageBuilds[0];
  
  // Prepare for storage with validation
  try {
    return preparePackageBuildData(latestBuild, prData);
  } catch (error) {
    console.error(`Failed to prepare package build data for PR #${prData.number}:`, error.message);
    return null;
  }
}

module.exports = {
  parseBlueOrangutanComment,
  parseLatestPackageBuild,
  preparePackageBuildData,
  
  // Export for testing
  parseV1,
  parseV2,
  parseV3,
  extractSlJid,
  extractBuildUrl,
  determineBuildStatus
};
