/**
 * Parser for Codecov bot comments posted on CloudStack PRs.
 *
 * Pure function — no DB or network access. Single source of truth, replacing
 * the (drifted) copies previously inlined in index.ts.
 */

export interface CodeCoverage {
  percentage: number;
  change: number;
  url: string;
}

/**
 * Parse a Codecov comment into coverage figures, or undefined when no
 * percentage can be found. `prNumber` is only used to build a fallback URL
 * when the comment doesn't contain a codecov.io link.
 *
 * Handles change formats: "+2.1%", "-1.5%", and "increased/decreased by N%".
 */
export function parseCodeCoverage(comment: string, prNumber: number): CodeCoverage | undefined {
  if (!comment) return undefined;

  const coverageMatch = comment.match(/(\d+\.?\d*)%/);
  if (!coverageMatch) return undefined;

  const changeMatch =
    comment.match(/([+-]\d+\.?\d*)%/) ||
    comment.match(/(increased|decreased)\s+by\s+(\d+\.?\d*)%/i);
  const urlMatch = comment.match(/(https?:\/\/(?:app\.)?codecov\.io\/[^\s)]+)/i);

  let change = 0;
  if (changeMatch) {
    if (changeMatch[1] === 'increased' || changeMatch[1] === 'decreased') {
      change = parseFloat(changeMatch[2] || '0');
      if (changeMatch[1] === 'decreased') change = -change;
    } else {
      change = parseFloat(changeMatch[1]);
    }
  }

  return {
    percentage: parseFloat(coverageMatch[1]),
    change,
    url: urlMatch ? urlMatch[1] : `https://app.codecov.io/gh/apache/cloudstack/pull/${prNumber}`,
  };
}
