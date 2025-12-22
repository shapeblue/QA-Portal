import React, { useState, useEffect } from 'react';
import './TestFailuresSummary.css';

interface TestFailureStats {
  total_failures: number;
  unique_tests: number;
  prs_affected: number;
  avg_failures_per_pr: number;
}

interface CommonFailure {
  test_name: string;
  test_file: string;
  occurrence_count: number;
  pr_count: number;
  hypervisors: string;
  last_seen: string;
  first_seen: string;
}

interface RecentFailure {
  id: number;
  pr_number: number;
  test_name: string;
  test_file: string;
  result: string;
  hypervisor: string;
  hypervisor_version: string;
  test_date: string;
  other_pr_count: number;
  is_common: boolean;
}

interface ByHypervisor {
  platform: string;
  failure_count: number;
  unique_tests: number;
  pr_count: number;
}

interface SummaryData {
  stats: TestFailureStats;
  commonFailures: CommonFailure[];
  recentFailures: RecentFailure[];
  byHypervisor: ByHypervisor[];
}

const TestFailuresSummary: React.FC = () => {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch('/api/test-failures/summary');
      if (!response.ok) throw new Error('Failed to fetch data');
      const json = await response.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return <div className="loading">Loading test failure analysis...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!data) {
    return <div className="error">No data available</div>;
  }

  return (
    <div className="test-failures-summary">
      <div className="header">
        <h1>🧪 Smoke Test Failures Analysis</h1>
        <p className="subtitle">Identify flaky tests and potential regressions</p>
      </div>

      {/* Statistics Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Failures</div>
          <div className="stat-value">{data.stats.total_failures}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unique Failing Tests</div>
          <div className="stat-value">{data.stats.unique_tests}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">PRs Affected</div>
          <div className="stat-value">{data.stats.prs_affected}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Failures/PR</div>
          <div className="stat-value">{data.stats.avg_failures_per_pr}</div>
        </div>
      </div>

      {/* Most Common Failures (Flaky Tests) */}
      <section className="failures-section">
        <h2>🔄 Most Common Failures (Likely Flaky Tests)</h2>
        <p className="section-desc">Tests failing across multiple PRs - likely infrastructure or test issues</p>
        
        <div className="table-container">
          <table className="failures-table">
            <thead>
              <tr>
                <th>Test Name</th>
                <th>Total Fails</th>
                <th>PRs Affected</th>
                <th>Hypervisors</th>
                <th>First Seen</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {data.commonFailures.map((failure, idx) => (
                <tr key={idx}>
                  <td className="test-name-cell">
                    <a href={`/test-failure/${encodeURIComponent(failure.test_name)}`}>
                      {failure.test_name}
                    </a>
                    <div className="test-file">{failure.test_file}</div>
                  </td>
                  <td className="center">
                    <span className="badge badge-amber">{failure.occurrence_count}</span>
                  </td>
                  <td className="center">
                    <span className="badge badge-blue">{failure.pr_count}</span>
                  </td>
                  <td className="hypervisors-cell">
                    {failure.hypervisors?.split(',').map((hv: string, i: number) => (
                      <span key={i} className="hv-badge">{hv.trim().toUpperCase()}</span>
                    ))}
                  </td>
                  <td>{formatDate(failure.first_seen)}</td>
                  <td>{formatDate(failure.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent Failures */}
      <section className="failures-section">
        <h2>📅 Recent Failures (Last 7 Days)</h2>
        <p className="section-desc">Latest test failures - color-coded by type</p>
        
        <div className="table-container">
          <table className="failures-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>PR</th>
                <th>Test Name</th>
                <th>Platform</th>
                <th>Result</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {data.recentFailures.map((failure) => (
                <tr key={failure.id}>
                  <td>{formatDate(failure.test_date)}</td>
                  <td>
                    <a href={`/pr/${failure.pr_number}`} className="pr-link">
                      #{failure.pr_number}
                    </a>
                  </td>
                  <td className="test-name-cell">
                    <a href={`/test-failure/${encodeURIComponent(failure.test_name)}`}>
                      {failure.test_name}
                    </a>
                  </td>
                  <td>
                    <span className="platform-badge">
                      {failure.hypervisor?.toUpperCase()}-{failure.hypervisor_version}
                    </span>
                  </td>
                  <td>
                    <span className={`result-badge ${failure.result.toLowerCase()}`}>
                      {failure.result}
                    </span>
                  </td>
                  <td>
                    {failure.is_common ? (
                      <span className="badge badge-amber" title={`Seen in ${failure.other_pr_count} other PRs`}>
                        Common ({failure.other_pr_count + 1} PRs)
                      </span>
                    ) : (
                      <span className="badge badge-red" title="First occurrence">
                        Unique ⚠️
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Failures by Hypervisor */}
      <section className="failures-section">
        <h2>💻 Failures by Platform</h2>
        <p className="section-desc">Distribution of failures across hypervisors</p>
        
        <div className="hypervisor-grid">
          {data.byHypervisor.map((hv, idx) => (
            <div key={idx} className="hypervisor-card">
              <div className="hypervisor-name">{hv.platform.toUpperCase()}</div>
              <div className="hypervisor-stats">
                <div className="hv-stat">
                  <span className="hv-stat-label">Total Failures</span>
                  <span className="hv-stat-value">{hv.failure_count}</span>
                </div>
                <div className="hv-stat">
                  <span className="hv-stat-label">Unique Tests</span>
                  <span className="hv-stat-value">{hv.unique_tests}</span>
                </div>
                <div className="hv-stat">
                  <span className="hv-stat-label">PRs</span>
                  <span className="hv-stat-value">{hv.pr_count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default TestFailuresSummary;
