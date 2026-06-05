/**
 * Parsers for BlueOrangutan / Trillian smoketest comments posted on CloudStack PRs.
 *
 * Pure functions only — no DB or network access. This is the single source of
 * truth for smoketest parsing; previously the same logic was copy-pasted (and
 * had drifted) across three handlers in index.ts.
 */

export interface SmokeTestResult {
  hypervisor: string;
  version?: string | null;
  passed: number;
  total: number;
  status: 'OK' | 'FAIL';
  logsUrl?: string;
  failedTests?: string[];
  createdAt?: string;
}

/** A row from the pr_trillian_comments table (only the fields we read). */
export interface TrillianRow {
  hypervisor?: string | null;
  version?: string | null;
  trillian_comment?: string | null;
  trillian_created_at?: string | null;
  logs_url?: string | null;
}

const ZIP_URL = /https:\/\/[^\s)]+\.zip/i;

/** Pull the first `*.zip` logs URL out of a comment, if any. */
export function extractLogsUrl(comment: string): string | undefined {
  const match = comment.match(ZIP_URL);
  return match ? match[0] : undefined;
}

/**
 * Extract failed test names from a Trillian comment. Prefers the markdown
 * table format ("test_name | `Error` | ..."), falling back to a looser
 * "test_name ERROR/FAIL" scan when no table rows match.
 */
export function extractFailedTests(comment: string): string[] {
  const failedTests: string[] = [];

  const tableRowPattern = /^\s*(\w*test_\w+)\s*\|\s*`(Error|Failure|error|failure)`/gm;
  let match: RegExpExecArray | null;
  while ((match = tableRowPattern.exec(comment)) !== null) {
    const testName = match[1];
    if (testName && !failedTests.includes(testName)) {
      failedTests.push(testName);
    }
  }

  if (failedTests.length === 0) {
    const testErrorPattern = /(test_\w+)[\s.]*(?:ERROR|FAIL|FAILED)/gi;
    while ((match = testErrorPattern.exec(comment)) !== null) {
      if (!failedTests.includes(match[1])) {
        failedTests.push(match[1]);
      }
    }
  }

  return failedTests;
}

/**
 * Split a combined hypervisor token (e.g. "xcpng82") into name + version when
 * the version column is empty. Leaves the value untouched when a version is
 * already present or no numeric suffix can be found.
 */
export function splitHypervisorVersion(
  hypervisor: string,
  version: string | null | undefined
): { hypervisor: string; version: string | null } {
  if (!version && hypervisor) {
    const hvMatch = hypervisor.match(/^([a-z]+)(.+)$/i);
    if (hvMatch && /\d/.test(hvMatch[2])) {
      return { hypervisor: hvMatch[1], version: hvMatch[2] };
    }
  }
  return { hypervisor, version: version ?? null };
}

/**
 * Parse a single Trillian comment row into a SmokeTestResult, or null when the
 * comment contains no recognisable result counts.
 *
 * Counts are read from the summary line, e.g. "141 look OK, 0 have errors,
 * 3 did not run". Skipped ("did not run") tests are included in the total so
 * that the pass ratio reflects the full suite. A run is FAIL only when there
 * is at least one error — skipped tests alone do not fail a run.
 */
export function parseSmokeTest(row: TrillianRow): SmokeTestResult | null {
  const comment = row.trillian_comment || '';

  const okMatch = comment.match(/(\d+)\s+look\s+OK/i);
  if (!okMatch) return null;

  const errorMatch = comment.match(/(\d+)\s+have\s+errors/i);
  const skippedMatch = comment.match(/(\d+)\s+did\s+not\s+run/i);

  const passed = parseInt(okMatch[1]);
  const errors = errorMatch ? parseInt(errorMatch[1]) : 0;
  const skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0;

  let total = passed;
  if (errorMatch) {
    total = passed + errors + skipped;
  } else if (skippedMatch) {
    total = passed + skipped;
  }

  if (total === 0) return null;

  const hasErrors = errors > 0;
  const failedTests = hasErrors ? extractFailedTests(comment) : [];
  const { hypervisor, version } = splitHypervisorVersion(row.hypervisor || '', row.version);
  const logsUrl = row.logs_url || extractLogsUrl(comment);

  return {
    hypervisor: hypervisor.toUpperCase() || 'UNKNOWN',
    version: version || null,
    passed,
    total,
    status: hasErrors ? 'FAIL' : 'OK',
    logsUrl: logsUrl || undefined,
    failedTests: hasErrors ? failedTests : undefined,
    createdAt: row.trillian_created_at || undefined,
  };
}

/** Parse every Trillian row for a PR, dropping rows with no usable result. */
export function parseSmokeTests(rows: TrillianRow[]): SmokeTestResult[] {
  return rows
    .map(parseSmokeTest)
    .filter((test): test is SmokeTestResult => test !== null);
}
