/**
 * Package Build Validation Utilities
 * 
 * Addresses QA Issue #2: Missing Data Validation
 * 
 * Purpose: Validate package names and build URLs before database insertion
 * to prevent SQL injection, malformed data, and security issues.
 */

/**
 * Validate package names
 * 
 * @param {string[]} packages - Array of package names to validate
 * @returns {string[]} - Validated and deduplicated package array
 * @throws {Error} - If validation fails
 */
function validatePackages(packages) {
  if (!Array.isArray(packages)) {
    throw new Error('Invalid packages: must be an array');
  }
  
  if (packages.length === 0) {
    throw new Error('Invalid packages: array cannot be empty');
  }
  
  const validPackagePattern = /^!?(el\d+|debian|suse\d+|ubuntu\d+)$/;
  
  const validatedPackages = [];
  const invalidPackages = [];
  
  for (const pkg of packages) {
    if (typeof pkg !== 'string') {
      invalidPackages.push(`${pkg} (not a string)`);
      continue;
    }
    
    if (pkg.length > 20) {
      invalidPackages.push(`${pkg} (too long)`);
      continue;
    }
    
    if (!validPackagePattern.test(pkg)) {
      invalidPackages.push(`${pkg} (invalid format)`);
      continue;
    }
    
    validatedPackages.push(pkg);
  }
  
  if (invalidPackages.length > 0) {
    throw new Error(`Invalid package names: ${invalidPackages.join(', ')}`);
  }
  
  return [...new Set(validatedPackages)];
}

/**
 * Validate build URL - QA Issue #9: Security
 */
function validateBuildUrl(url) {
  if (!url) return null;
  
  if (typeof url !== 'string') {
    console.warn(`Invalid build URL type: ${typeof url}`);
    return null;
  }
  
  const allowedDomains = [
    'jenkins.shapeblue.com',
    'build.cloudstack.org',
    'jenkins.buildacloud.org'
  ];
  
  try {
    const parsed = new URL(url);
    
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      console.warn(`Suspicious build URL protocol: ${parsed.protocol}`);
      return null;
    }
    
    const isAllowed = allowedDomains.some(domain => 
      parsed.hostname === domain || 
      parsed.hostname.endsWith('.' + domain)
    );
    
    if (!isAllowed) {
      console.warn(`Suspicious build URL domain: ${parsed.hostname}`);
      return null;
    }
    
    return url;
  } catch (error) {
    console.error(`Invalid build URL format: ${url}`);
    return null;
  }
}

function validateSlJid(slJid) {
  if (slJid === null || slJid === undefined) return null;
  
  const numericJid = typeof slJid === 'string' ? parseInt(slJid, 10) : slJid;
  
  if (isNaN(numericJid) || numericJid <= 0 || numericJid > 10000000) {
    console.warn(`Invalid SL-JID: ${slJid}`);
    return null;
  }
  
  return numericJid;
}

function validateBuildStatus(status) {
  const validStatuses = ['success', 'failed', 'partial'];
  if (!status || !validStatuses.includes(status)) {
    return 'success';
  }
  return status;
}

function validatePackageBuildData(packageData) {
  if (!packageData || typeof packageData !== 'object') {
    throw new Error('Package build data must be an object');
  }
  
  if (!packageData.packages) {
    throw new Error('Package build data must include packages array');
  }
  
  if (!packageData.commentId) {
    throw new Error('Package build data must include commentId');
  }
  
  if (!packageData.createdAt) {
    throw new Error('Package build data must include createdAt timestamp');
  }
  
  const validated = {
    packages: validatePackages(packageData.packages),
    slJid: validateSlJid(packageData.slJid),
    buildUrl: validateBuildUrl(packageData.buildUrl),
    buildStatus: validateBuildStatus(packageData.buildStatus || 'success'),
    commentId: packageData.commentId,
    createdAt: packageData.createdAt,
    headCommitSha: packageData.headCommitSha || null,
    headCommitDate: packageData.headCommitDate || null
  };
  
  return validated;
}

module.exports = {
  validatePackages,
  validateBuildUrl,
  validateSlJid,
  validateBuildStatus,
  validatePackageBuildData
};
