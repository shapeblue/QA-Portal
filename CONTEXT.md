# QA Portal

A read-only dashboard over a shared MySQL database (`cloudstack_tests`) that surfaces
CloudStack pull-request health, upgrade-test results, and test-failure tracking. Data is
written exclusively by scraper scripts; the web app only reads.

## Language

### Test outcomes

**Flaky Test**:
A test that produces inconsistent outcomes over time — it both fails *and* passes for the
same code. The signal is instability of the test itself, not breadth. A test that always
fails everywhere is **not** flaky (it is consistent).
_Avoid_: intermittent, unstable test (as separate nouns)

**Common Failure**:
A test failing across two or more concurrent open PRs right now. The signal is that the
failure is not caused by the PR under review. Independent of consistency — a consistently
broken test is a Common Failure but not a Flaky Test.
_Avoid_: shared failure, widespread failure

**Test Result**:
A single recorded outcome of one test on one platform, one of `Success`, `Failure`, or
`Error`. `Error` denotes an infrastructure/harness problem (not a test verdict) and is
excluded from failure analytics.
_Avoid_: test run (when you mean a single row)

### Pull requests

**Ready to Merge**:
A PR that satisfies the project's merge-readiness rule: 2+ approving reviews, no
changes-requested reviews, and all smoke tests passing. Computed by the scraper and stored
as an attribute on the PR (the API only filters on it), so the rule is defined in exactly
one place.
_Avoid_: mergeable, approved (those mean narrower things)

**Smoke Test**:
A per-hypervisor integration test run reported via Trillian comments on a PR, summarised as
passed/total with an `OK`/`FAIL` status.
_Avoid_: integration test, CI run (when you mean this specific Trillian result)
