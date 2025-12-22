# Smoke Test Failure Analysis - Implementation Plan

## ✅ COMPLETED

### 1. Database Schema
- Created `test_failures` table with fields:
  - pr_number, test_name, test_file, result, time_seconds
  - hypervisor, hypervisor_version, test_date, logs_url
  - Indexed for fast queries

### 2. Data Parsing
- Created `parse-test-failures.js` script
- Parses Trillian markdown tables from comments
- **Results**: 1,038 test failures from 77 PRs, 340 unique failing tests

### 3. Common Failure Analysis
- Identified most common failures across PRs:
  - `test_03_deploy_and_scale_kubernetes_cluster` - 25 PRs (FLAKY)
  - `test_01_vpn_usage` - 14 PRs (FLAKY)
  - `test_01_migrate_vm_strict_tags_success` - 13 PRs (FLAKY)

## 🚧 TODO - NEXT STEPS

### 4. Update Scraper (scrape-github-prs.js)
Add failure parsing to the scraper so new PRs automatically get analyzed:
```javascript
// After storing trillian comment, parse and store failures
const failures = parseTestFailures(trillianComment);
for (const failure of failures) {
  await storeTestFailure(pr_number, failure, hypervisor, version, ...);
}
```

### 5. Backend API Endpoints (server/src/index.ts)

```typescript
// Get test failures for a specific PR with common/unique classification
app.get('/api/prs/:prNumber/test-failures', async (req, res) => {
  const failures = await getTestFailures(req.params.prNumber);
  
  // Classify each failure
  for (const failure of failures) {
    const occurrences = await countFailureInOtherPRs(failure.test_name);
    failure.is_common = occurrences > 3; // Seen in 3+ other PRs
    failure.occurrence_count = occurrences;
  }
  
  res.json(failures);
});

// Get smoke test failures summary page data
app.get('/api/test-failures/summary', async (req, res) => {
  const data = {
    // Most common failures across all PRs
    commonFailures: await getCommonFailures(limit: 20),
    
    // Recent failures (last 7 days)
    recentFailures: await getRecentFailures(days: 7),
    
    // Failure trends by hypervisor
    byHypervisor: await getFailuresByHypervisor(),
    
    // Flaky test candidates (high occurrence, different PRs)
    flakyTests: await getFlakyTests(minOccurrences: 5),
    
    // Statistics
    stats: {
      totalFailures: count,
      uniqueTests: count,
      prsAffected: count,
      avgFailuresPerPR: avg
    }
  };
  
  res.json(data);
});

// Get failure history for a specific test
app.get('/api/test-failures/test/:testName', async (req, res) => {
  const history = await getTestFailureHistory(req.params.testName);
  res.json({
    test_name: testName,
    total_occurrences: count,
    prs_affected: [...],
    first_seen: date,
    last_seen: date,
    hypervisors: [...],
    failure_rate: percentage
  });
});
```

### 6. Frontend - Update AllPRsView.tsx

Add color-coded failure display in the smoke tests section:

```tsx
// In the test results display
{pr.smokeTests.map((test) => {
  const failures = test.failures || []; // Get from new API
  
  return (
    <div key={test.hypervisor} className="test-result">
      <span className="hv-name">{test.hypervisor}</span>
      <span className={test.status === 'OK' ? 'pass' : 'fail'}>
        {test.passed}/{test.total}
      </span>
      
      {failures.length > 0 && (
        <div className="failures-breakdown">
          {failures.map(f => (
            <div 
              key={f.test_name}
              className={f.is_common ? 'failure-common' : 'failure-unique'}
              title={`${f.test_name} - Seen in ${f.occurrence_count} PR(s)`}
            >
              {f.test_name}
              {f.is_common && <span className="badge amber">Common</span>}
              {!f.is_common && <span className="badge red">New</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
})}
```

CSS:
```css
.failure-common {
  color: #ff9800; /* Amber for common failures */
  border-left: 3px solid #ff9800;
}

.failure-unique {
  color: #f44336; /* Red for unique/new failures */
  border-left: 3px solid #f44336;
  font-weight: bold;
}

.badge.amber {
  background: #ff9800;
  color: white;
}

.badge.red {
  background: #f44336;
  color: white;
}
```

### 7. New Component - TestFailuresSummary.tsx

Create new page showing:

```tsx
<div className="test-failures-summary">
  <h1>Smoke Test Failures Analysis</h1>
  
  {/* Statistics Cards */}
  <div className="stats-grid">
    <StatCard title="Total Failures" value={stats.totalFailures} />
    <StatCard title="Unique Tests" value={stats.uniqueTests} />
    <StatCard title="PRs Affected" value={stats.prsAffected} />
    <StatCard title="Avg Failures/PR" value={stats.avgFailuresPerPR} />
  </div>
  
  {/* Most Common Failures */}
  <Section title="Most Common Failures (Likely Flaky)">
    <Table>
      <thead>
        <tr>
          <th>Test Name</th>
          <th>Occurrences</th>
          <th>PRs Affected</th>
          <th>Hypervisors</th>
          <th>Last Seen</th>
        </tr>
      </thead>
      <tbody>
        {commonFailures.map(failure => (
          <tr key={failure.test_name}>
            <td>
              <Link to={`/test-failure/${failure.test_name}`}>
                {failure.test_name}
              </Link>
            </td>
            <td>{failure.occurrence_count}</td>
            <td>{failure.pr_count}</td>
            <td>{failure.hypervisors.join(', ')}</td>
            <td>{formatDate(failure.last_seen)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  </Section>
  
  {/* Recent Failures */}
  <Section title="Recent Failures (Last 7 Days)">
    <Table>
      <thead>
        <tr>
          <th>Date</th>
          <th>PR</th>
          <th>Test Name</th>
          <th>Hypervisor</th>
          <th>Type</th>
        </tr>
      </thead>
      <tbody>
        {recentFailures.map(failure => (
          <tr key={failure.id}>
            <td>{formatDate(failure.test_date)}</td>
            <td>
              <Link to={`/pr/${failure.pr_number}`}>
                #{failure.pr_number}
              </Link>
            </td>
            <td>{failure.test_name}</td>
            <td>{failure.hypervisor}-{failure.hypervisor_version}</td>
            <td>
              <Badge color={failure.is_common ? 'amber' : 'red'}>
                {failure.is_common ? 'Common' : 'Unique'}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  </Section>
  
  {/* Failure Trends by Hypervisor */}
  <Section title="Failures by Hypervisor">
    <BarChart data={byHypervisor} />
  </Section>
</div>
```

### 8. Update App.tsx Routing

```tsx
<Route path="/test-failures" element={<TestFailuresSummary />} />
<Route path="/test-failure/:testName" element={<TestFailureDetail />} />
```

Add navigation link:
```tsx
<nav>
  <Link to="/all-prs">All PRs</Link>
  <Link to="/ready-to-merge">Ready to Merge</Link>
  <Link to="/upgrade-tests">Upgrade Tests</Link>
  <Link to="/test-failures">Test Failures</Link> {/* NEW */}
</nav>
```

## 📊 CLASSIFICATION LOGIC

```javascript
function classifyFailure(testName, prNumber) {
  // Count how many OTHER PRs have this failure
  const occurrences = await db.query(`
    SELECT COUNT(DISTINCT pr_number) as count
    FROM test_failures
    WHERE test_name = ?
      AND pr_number != ?
  `, [testName, prNumber]);
  
  if (occurrences.count >= 3) {
    return {
      type: 'COMMON',
      color: 'amber',
      label: 'Common Failure (Flaky Test)',
      severity: 'low' // Not likely caused by this PR
    };
  } else {
    return {
      type: 'UNIQUE',
      color: 'red',
      label: 'New Failure (Potential Regression)',
      severity: 'high' // Likely caused by this PR
    };
  }
}
```

## 🎯 KEY INSIGHTS TO SHOW

1. **For Each PR**: 
   - Amber: Tests failing in multiple PRs (flaky/infra issues)
   - Red: Tests only failing in this PR (likely regressions)

2. **Summary Page**:
   - Top 20 flaky tests needing attention
   - Recent unique failures (potential new bugs)
   - Trends over time
   - By hypervisor analysis

3. **Test Detail Page**:
   - Full history of a specific test failure
   - All PRs where it failed
   - Success/failure rate
   - Recommend: "Fix this flaky test" or "Investigate further"

## 🚀 DEPLOYMENT STEPS

1. Run parse-test-failures.js initially (DONE)
2. Update scraper to parse failures on each run
3. Add API endpoints to server
4. Update AllPRsView with color coding
5. Create TestFailuresSummary component
6. Add routing and navigation
7. Test and refine classification thresholds

## 📈 FUTURE ENHANCEMENTS

- Email alerts for new unique failures
- Automated GitHub comments with failure analysis
- ML-based flakiness detection
- Test reliability score per test
- Trend prediction (getting better/worse)
