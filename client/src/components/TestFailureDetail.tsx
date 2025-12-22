import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './TestFailureDetail.css';

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

interface TestStats {
  total_occurrences: number;
  prs_affected: number;
  platforms: number;
  first_seen: string;
  last_seen: string;
  hypervisors: string;
}

interface TestFailureData {
  test_name: string;
  stats: TestStats;
  history: TestFailureHistory[];
}

const TestFailureDetail: React.FC = () => {
  const { testName } = useParams<{ testName: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<TestFailureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (testName) {
      fetchData(testName);
    }
  }, [testName]);

  const fetchData = async (name: string) => {
    try {
      const response = await fetch(`/api/test-failures/test/${encodeURIComponent(name)}`);
      if (!response.ok) throw new Error('Failed to fetch test failure history');
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
    return <div className="loading">Loading test failure history...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!data) {
    return <div className="error">No data available</div>;
  }

  return (
    <div className="test-failure-detail">
      <button className="back-button" onClick={() => navigate('/test-failures')}>
        ← Back to Test Failures
      </button>

      <div className="header">
        <h1>🧪 {data.test_name}</h1>
        <p className="test-file">{data.history[0]?.test_file || 'Unknown file'}</p>
      </div>

      {/* Statistics */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Occurrences</div>
          <div className="stat-value">{data.stats.total_occurrences}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">PRs Affected</div>
          <div className="stat-value">{data.stats.prs_affected}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Platforms</div>
          <div className="stat-value">{data.stats.platforms}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">First Seen</div>
          <div className="stat-value-small">{formatDate(data.stats.first_seen)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Seen</div>
          <div className="stat-value-small">{formatDate(data.stats.last_seen)}</div>
        </div>
      </div>

      {/* Hypervisors */}
      <div className="info-section">
        <h3>Affected Hypervisors</h3>
        <div className="hypervisor-tags">
          {data.stats.hypervisors?.split(',').map((hv: string, i: number) => (
            <span key={i} className="hv-tag">{hv.trim().toUpperCase()}</span>
          ))}
        </div>
      </div>

      {/* Analysis */}
      <div className="analysis-section">
        <h3>📊 Analysis</h3>
        <div className="analysis-card">
          {data.stats.prs_affected >= 5 ? (
            <div className="analysis-item flaky">
              <span className="icon">🔄</span>
              <div>
                <strong>Likely Flaky Test</strong>
                <p>This test has failed in {data.stats.prs_affected} different PRs. This indicates a flaky test or infrastructure issue, not a bug introduced by individual PRs.</p>
              </div>
            </div>
          ) : (
            <div className="analysis-item potential-bug">
              <span className="icon">⚠️</span>
              <div>
                <strong>Potential Bug</strong>
                <p>This test has failed in only {data.stats.prs_affected} PR(s). This might indicate a real bug that needs investigation.</p>
              </div>
            </div>
          )}
          
          <div className="recommendation">
            <strong>Recommendation:</strong>
            {data.stats.prs_affected >= 5 ? (
              <p>Create a bug report for this flaky test. It should be fixed or disabled to improve CI reliability.</p>
            ) : (
              <p>Investigate the failing PRs to understand if there's a common cause or if it's a legitimate regression.</p>
            )}
          </div>
        </div>
      </div>

      {/* Failure History */}
      <section className="history-section">
        <h2>📜 Failure History (Latest First)</h2>
        <p className="section-desc">All occurrences of this test failure across different PRs</p>
        
        <div className="history-table-container">
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
              {data.history.map((item, idx) => (
                <tr key={idx} className={idx === 0 ? 'latest' : ''}>
                  <td>{formatDate(item.test_date)}</td>
                  <td className="time-ago">{getTimeDiff(item.test_date)}</td>
                  <td>
                    <a 
                      href={`https://github.com/apache/cloudstack/pull/${item.pr_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pr-link"
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
                      >
                        📄 View Logs
                      </a>
                    ) : (
                      <span className="no-logs">No logs</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Trend Analysis */}
      {data.history.length > 3 && (
        <section className="trend-section">
          <h3>📈 Trend Analysis</h3>
          <div className="trend-info">
            <p>
              <strong>Recent Activity:</strong> 
              {data.history.slice(0, 5).every((h, i) => i === 0 || new Date(h.test_date) < new Date(data.history[i-1].test_date)) 
                ? ' Test continues to fail in recent PRs.' 
                : ' Some recent PRs may have passed.'}
            </p>
            <p>
              <strong>Duration Trend:</strong> 
              {(() => {
                const recent = data.history.slice(0, 3).map(h => h.time_seconds).filter(t => t);
                const older = data.history.slice(-3).map(h => h.time_seconds).filter(t => t);
                if (recent.length && older.length) {
                  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
                  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
                  return recentAvg > olderAvg 
                    ? ' Test duration is increasing (getting slower).' 
                    : ' Test duration is stable or improving.';
                }
                return ' Insufficient data for duration analysis.';
              })()}
            </p>
          </div>
        </section>
      )}
    </div>
  );
};

export default TestFailureDetail;
