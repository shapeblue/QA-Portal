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

interface TestFailureHistory {
  pr_number: number;
  test_file: string;
  result: string;
  time_seconds: number;
  hypervisor: string;
  hypervisor_version: string;
  test_date: string;
  logs_url: string;
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
  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [testHistory, setTestHistory] = useState<TestFailureHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

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

  const fetchTestHistory = async (testName: string) => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/test-failures/test/${encodeURIComponent(testName)}`);
      if (!response.ok) throw new Error('Failed to fetch test history');
      const json = await response.json();
      setTestHistory(json.history || []);
    } catch (err: any) {
      console.error('Error fetching test history:', err);
      setTestHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const toggleTest = async (testName: string) => {
    if (expandedTest === testName) {
      // Collapse
      setExpandedTest(null);
      setTestHistory([]);
    } else {
      // Expand
      setExpandedTest(testName);
      await fetchTestHistory(testName);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTimeDiff = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
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

      {/* Most Common Failures */}
      <section className="failures-section">
        <h2>🔄 Most Common Failures (Likely Flaky Tests)</h2>
        <p className="section-desc">Tests failing across multiple PRs - click to see history</p>
        
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
                <React.Fragment key={idx}>
                  <tr 
                    className={`expandable-row ${expandedTest === failure.test_name ? 'expanded' : ''}`}
                    onClick={() => toggleTest(failure.test_name)}
                  >
                    <td className="test-name-cell">
                      <span className="expand-icon">
                        {expandedTest === failure.test_name ? '▼' : '▶'}
                      </span>
                      <span className="test-name">{failure.test_name}</span>
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
                  
                  {/* Expanded History */}
                  {expandedTest === failure.test_name && (
                    <tr className="expanded-content">
                      <td colSpan={6}>
                        <div className="history-details">
                          <h3>📜 Failure History (Latest First)</h3>
                          {loadingHistory ? (
                            <div className="loading-history">Loading history...</div>
                          ) : testHistory.length === 0 ? (
                            <div className="no-history">No history available</div>
                          ) : (
                            <table className="history-table">
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>Time Ago</th>
                                  <th>PR</th>
                                  <th>Platform</th>
                                  <th>Result</th>
                                  <th>Duration</th>
                                  <th>Logs</th>
                                </tr>
                              </thead>
                              <tbody>
                                {testHistory.slice(0, 10).map((item, histIdx) => (
                                  <tr key={histIdx} className={histIdx === 0 ? 'latest' : ''}>
                                    <td>{formatDateTime(item.test_date)}</td>
                                    <td className="time-ago">{getTimeDiff(item.test_date)}</td>
                                    <td>
                                      <a 
                                        href={`https://github.com/apache/cloudstack/pull/${item.pr_number}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="pr-link"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        #{item.pr_number}
                                      </a>
                                    </td>
                                    <td>
                                      <span className="platform-badge">
                                        {item.hypervisor?.toUpperCase() || 'N/A'}-{item.hypervisor_version || 'N/A'}
                                      </span>
                                    </td>
                                    <td>
                                      <span className={`result-badge ${item.result.toLowerCase()}`}>
                                        {item.result}
                                      </span>
                                    </td>
                                    <td className="duration">
                                      {item.time_seconds ? `${item.time_seconds.toFixed(1)}s` : 'N/A'}
                                    </td>
                                    <td>
                                      {item.logs_url ? (
                                        <a 
                                          href={item.logs_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="logs-link"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          📄 Logs
                                        </a>
                                      ) : (
                                        <span className="no-logs">-</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {testHistory.length > 10 && (
                            <div className="history-note">
                              Showing latest 10 of {testHistory.length} failures
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
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
                    <a 
                      href={`https://github.com/apache/cloudstack/pull/${failure.pr_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pr-link"
                    >
                      #{failure.pr_number}
                    </a>
                  </td>
                  <td className="test-name-cell">
                    {failure.test_name}
                  </td>
                  <td>
                    <span className="platform-badge">
                      {failure.hypervisor?.toUpperCase() || 'N/A'}-{failure.hypervisor_version || 'N/A'}
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
          {data.byHypervisor
            .filter(hv => hv && hv.platform)
            .map((hv, idx) => (
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
