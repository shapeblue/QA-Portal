import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSmokeTest,
  parseSmokeTests,
  extractFailedTests,
  extractLogsUrl,
  splitHypervisorVersion,
} from './trillian';

test('parses a clean passing run', () => {
  const result = parseSmokeTest({
    hypervisor: 'kvm',
    version: 'centos7',
    trillian_comment: '141 look OK, 0 have errors',
    trillian_created_at: '2026-01-01T00:00:00Z',
    logs_url: 'https://example.com/logs.zip',
  });
  assert.deepEqual(result, {
    hypervisor: 'KVM',
    version: 'centos7',
    passed: 141,
    total: 141,
    status: 'OK',
    logsUrl: 'https://example.com/logs.zip',
    failedTests: undefined,
    createdAt: '2026-01-01T00:00:00Z',
  });
});

test('marks a run with errors as FAIL and includes total', () => {
  const result = parseSmokeTest({
    hypervisor: 'KVM',
    version: '1',
    trillian_comment: '138 look OK, 3 have errors',
  });
  assert.equal(result?.status, 'FAIL');
  assert.equal(result?.passed, 138);
  assert.equal(result?.total, 141);
});

test('counts skipped ("did not run") tests in the total but does not FAIL the run', () => {
  const result = parseSmokeTest({
    hypervisor: 'vmware',
    version: '67u3',
    trillian_comment: '140 look OK, 0 have errors, 5 did not run',
  });
  // Regression guard: the old getAllOpenPRs parser used passed===total and
  // would have flagged this OK run as FAIL purely because of skipped tests.
  assert.equal(result?.status, 'OK');
  assert.equal(result?.total, 145);
});

test('skipped tests with errors all roll into the total', () => {
  const result = parseSmokeTest({
    hypervisor: 'kvm',
    trillian_comment: '130 look OK, 2 have errors, 8 did not run',
  });
  assert.equal(result?.total, 140);
  assert.equal(result?.status, 'FAIL');
});

test('returns null when there is no recognisable OK count', () => {
  assert.equal(parseSmokeTest({ trillian_comment: 'build is still running' }), null);
  assert.equal(parseSmokeTest({ trillian_comment: '' }), null);
  assert.equal(parseSmokeTest({}), null);
});

test('extracts failed test names from a markdown table', () => {
  const comment = [
    '138 look OK, 2 have errors',
    'Test | Result | Time (s) | Test File',
    '--- | --- | --- | ---',
    'test_foo_bar | `Error` | 1.10 | test_foo.py',
    'test_baz | `Failure` | 0.50 | test_baz.py',
  ].join('\n');
  const result = parseSmokeTest({ hypervisor: 'kvm', trillian_comment: comment });
  assert.deepEqual(result?.failedTests, ['test_foo_bar', 'test_baz']);
});

test('failedTests is an empty array when errors are reported but none parse', () => {
  const result = parseSmokeTest({
    hypervisor: 'kvm',
    trillian_comment: '138 look OK, 2 have errors',
  });
  assert.deepEqual(result?.failedTests, []);
});

test('prefers the logs_url column over the comment, falls back to the comment', () => {
  const withColumn = parseSmokeTest({
    hypervisor: 'kvm',
    trillian_comment: '1 look OK, 0 have errors https://comment.example/logs.zip',
    logs_url: 'https://db.example/logs.zip',
  });
  assert.equal(withColumn?.logsUrl, 'https://db.example/logs.zip');

  const fromComment = parseSmokeTest({
    hypervisor: 'kvm',
    trillian_comment: '1 look OK, 0 have errors https://comment.example/logs.zip',
  });
  assert.equal(fromComment?.logsUrl, 'https://comment.example/logs.zip');
});

test('splits a combined hypervisor token when version is missing', () => {
  assert.deepEqual(splitHypervisorVersion('xcpng82', null), {
    hypervisor: 'xcpng',
    version: '82',
  });
  // Leaves it alone when version is already set.
  assert.deepEqual(splitHypervisorVersion('xcpng', '82'), {
    hypervisor: 'xcpng',
    version: '82',
  });
  // No numeric suffix -> unchanged.
  assert.deepEqual(splitHypervisorVersion('kvm', null), {
    hypervisor: 'kvm',
    version: null,
  });
});

test('extractFailedTests falls back to loose ERROR/FAIL scan', () => {
  assert.deepEqual(extractFailedTests('test_alpha FAILED and test_beta ERROR'), [
    'test_alpha',
    'test_beta',
  ]);
});

test('extractLogsUrl returns undefined when no zip url present', () => {
  assert.equal(extractLogsUrl('no link here'), undefined);
});

test('parseSmokeTests drops unparseable rows', () => {
  const results = parseSmokeTests([
    { hypervisor: 'kvm', trillian_comment: '10 look OK, 0 have errors' },
    { hypervisor: 'kvm', trillian_comment: 'still running' },
  ]);
  assert.equal(results.length, 1);
});
