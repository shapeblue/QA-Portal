import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCodeCoverage } from './codecov';

test('parses percentage and signed change', () => {
  const result = parseCodeCoverage('Coverage: 85.23% (+2.10%)', 123);
  assert.equal(result?.percentage, 85.23);
  assert.equal(result?.change, 2.1);
});

test('parses a negative change', () => {
  const result = parseCodeCoverage('Coverage is 80.00% (-1.50%)', 123);
  assert.equal(result?.change, -1.5);
});

test('parses "increased by"/"decreased by" phrasing', () => {
  assert.equal(parseCodeCoverage('coverage increased by 3.2% to 90%', 1)?.change, 3.2);
  assert.equal(parseCodeCoverage('coverage decreased by 1.1% to 70%', 1)?.change, -1.1);
});

test('extracts a codecov.io url when present', () => {
  const result = parseCodeCoverage(
    'See https://app.codecov.io/gh/apache/cloudstack/pull/999 — 75% covered',
    999
  );
  assert.equal(result?.url, 'https://app.codecov.io/gh/apache/cloudstack/pull/999');
});

test('falls back to a constructed url when none is in the comment', () => {
  const result = parseCodeCoverage('Coverage: 75%', 456);
  assert.equal(result?.url, 'https://app.codecov.io/gh/apache/cloudstack/pull/456');
});

test('returns undefined when no percentage is present', () => {
  assert.equal(parseCodeCoverage('no numbers here', 1), undefined);
  assert.equal(parseCodeCoverage('', 1), undefined);
});

test('change defaults to 0 when only a total is given', () => {
  assert.equal(parseCodeCoverage('Coverage: 88%', 1)?.change, 0);
});
