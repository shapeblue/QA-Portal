import React, { useEffect, useState } from 'react';
import './TestResults.css';

interface Platform {
  hypervisor: string;
  hypervisor_version: string;
  total_runs: number;
  failure_count: number;
  success_count: number;
  error_count: number;
  log_url: string | null;
}

interface FlakyTest {
  test_name: string;
  platforms: Platform[];
  total_failures: number;
  last_failure_date: string;
  pr_numbers: string;
}

interface TestFile {
  test_file: string;
  tests: FlakyTest[];
  total_failures: number;
  last_failure_date: string;
}

const TestResults: React.FC = () => {
  const [testFiles, setTestFiles] = useState<TestFile[]>([]);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFlakyTests();
  }, []);

  const fetchFlakyTests = async () => {
    try {
      setLoading(true);
      setLoadingProgress(0);
      
      // Show progress updates
      const progressInterval = setInterval(() => {
        setLoadingProgress(prev => Math.min(prev + 2, 95));
      }, 1000);
      
      const response = await fetch('/api/test-results/flaky');
      clearInterval(progressInterval);
      setLoadingProgress(100);
      
      if (!response.ok) throw new Error('Failed to fetch data');
      const data = await response.json();
      setTestFiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const toggleFile = (fileName: string) => {
    setExpandedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileName)) {
        newSet.delete(fileName);
      } else {
        newSet.add(fileName);
      }
      return newSet;
    });
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Never';
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

  const getTotalTests = () => {
    return testFiles.reduce((sum, file) => sum + file.tests.length, 0);
  };

  if (loading) {
    return (
      <div className="test-results">
        <div className="loading">
          <div>Loading flaky test results...</div>
          <div style={{ marginTop: '10px', width: '300px', height: '4px', background: '#e0e0e0', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${loadingProgress}%`, height: '100%', background: '#4CAF50', transition: 'width 0.5s' }}></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="test-results">
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="test-results">
      <header className="page-header">
        <h1>Flaky Test Results</h1>
        <p className="subtitle">
          Tests with multiple failures in the last 10 runs per hypervisor
        </p>
      </header>

      <div className="stats-summary">
        <div className="stat-card">
          <div className="stat-value">{testFiles.length}</div>
          <div className="stat-label">Test Files</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{getTotalTests()}</div>
          <div className="stat-label">Flaky Tests</div>
        </div>
      </div>

      <section className="flaky-tests-section">
        <h2>Flaky Tests by File</h2>
        <div className="test-files-list">
          {testFiles.map((file, fileIndex) => (
            <div key={fileIndex} className="test-file-group">
              <div 
                className="test-file-header"
                onClick={() => toggleFile(file.test_file)}
              >
                <span className="expand-icon">
                  {expandedFiles.has(file.test_file) ? '▼' : '▶'}
                </span>
                <div className="file-info">
                  <strong className="file-name">{file.test_file}</strong>
                  <span className="file-stats">
                    {file.tests.length} test{file.tests.length !== 1 ? 's' : ''}, {file.total_failures} failure{file.total_failures !== 1 ? 's' : ''}
                  </span>
                </div>
                <span className="last-failure">
                  Last failure: {formatDate(file.last_failure_date)}
                </span>
              </div>
              
              {expandedFiles.has(file.test_file) && (
                <div className="test-file-content">
                  <table className="flaky-tests-table">
                    <thead>
                      <tr>
                        <th>Test Name</th>
                        <th>Platforms</th>
                        <th title="Maximum failures across all platforms">Worst Platform Failures</th>
                        <th>Last Failure</th>
                        <th>PRs Affected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {file.tests.map((test, testIndex) => (
                        <tr key={testIndex}>
                          <td className="test-name-cell">
                            <strong>{test.test_name}</strong>
                          </td>
                          <td>
                            <div className="platforms-list">
                              {test.platforms.map((platform, pIndex) => {
                                const platformLabel = `${platform.hypervisor?.toUpperCase() || 'N/A'}-${platform.hypervisor_version || 'N/A'}`;
                                const title = `${platform.failure_count} failures, ${platform.success_count} successes in last ${platform.total_runs} runs. Click to view logs.`;
                                
                                return platform.log_url ? (
                                  <a
                                    key={pIndex}
                                    href={platform.log_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="platform-badge clickable"
                                    title={title}
                                  >
                                    {platformLabel}
                                  </a>
                                ) : (
                                  <span
                                    key={pIndex}
                                    className="platform-badge"
                                    title={`${platform.failure_count} failures, ${platform.success_count} successes in last ${platform.total_runs} runs. No log available.`}
                                  >
                                    {platformLabel}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="failure-count-cell">
                            <span className="failure-badge">✗ {test.total_failures}</span>
                          </td>
                          <td className="date-cell">
                            {formatDate(test.last_failure_date)}
                          </td>
                          <td className="pr-list">
                            {test.pr_numbers?.split(',').slice(0, 5).map((prNum) => (
                              <a
                                key={prNum}
                                href={`https://github.com/apache/cloudstack/pull/${prNum}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="pr-badge"
                              >
                                #{prNum}
                              </a>
                            ))}
                            {test.pr_numbers?.split(',').length > 5 && (
                              <span className="more-prs">
                                +{test.pr_numbers.split(',').length - 5} more
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>

        {testFiles.length === 0 && (
          <div className="no-data">
            <p>🎉 No flaky tests found! All tests are stable.</p>
          </div>
        )}
      </section>
    </div>
  );
};

export default TestResults;
