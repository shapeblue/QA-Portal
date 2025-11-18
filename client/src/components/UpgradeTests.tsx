import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { UpgradeTestResult, UpgradeTestFilters, UpgradeTestStats } from '../types';
import './UpgradeTests.css';

interface GroupedTest {
  upgrade_path: string;
  from_version: string;
  to_version: string;
  tests: UpgradeTestResult[];
}

const UpgradeTests: React.FC = () => {
  const [tests, setTests] = useState<UpgradeTestResult[]>([]);
  const [filters, setFilters] = useState<UpgradeTestFilters | null>(null);
  const [stats, setStats] = useState<UpgradeTestStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'matrix' | 'grouped' | 'history'>('matrix');
  
  const [selectedFilters, setSelectedFilters] = useState({
    fromVersion: '',
    toVersion: '',
    distro: '',
    hypervisor: '',
    status: '',
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [testsData, filtersData, statsData] = await Promise.all([
        api.getUpgradeTests(),
        api.getUpgradeTestFilters(),
        api.getUpgradeTestStats(),
      ]);
      setTests(testsData);
      setFilters(filtersData);
      setStats(statsData);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load upgrade tests');
    } finally {
      setLoading(false);
    }
  };

  // Normalize version strings (4.20.0 -> 4.20, remove .0 suffix)
  const normalizeVersion = (version: string | null | undefined): string => {
    if (!version) return '';
    return version.replace(/\.0$/, '');
  };

  // Filter out tests with unknown/missing versions
  const validTests = tests.filter(test => {
    const fromVersion = normalizeVersion(test.upgrade_start_version);
    const toVersion = normalizeVersion(test.upgrade_target_version);
    return fromVersion && toVersion && 
           fromVersion.toLowerCase() !== 'unknown' && 
           toVersion.toLowerCase() !== 'unknown';
  });

  const handleFilterChange = (filterName: string, value: string) => {
    setSelectedFilters((prev) => ({ ...prev, [filterName]: value }));
  };

  const applyFilters = async () => {
    setLoading(true);
    setError(null);
    try {
      const activeFilters: any = {};
      if (selectedFilters.fromVersion) activeFilters.fromVersion = selectedFilters.fromVersion;
      if (selectedFilters.toVersion) activeFilters.toVersion = selectedFilters.toVersion;
      if (selectedFilters.distro) activeFilters.distro = selectedFilters.distro;
      if (selectedFilters.hypervisor) activeFilters.hypervisor = selectedFilters.hypervisor;
      if (selectedFilters.status) activeFilters.status = selectedFilters.status;

      const testsData = await api.getUpgradeTests(activeFilters);
      setTests(testsData);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to apply filters');
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSelectedFilters({
      fromVersion: '',
      toVersion: '',
      distro: '',
      hypervisor: '',
      status: '',
    });
    loadInitialData();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusClass = (status?: string | null) => {
    switch (status) {
      case 'PASS':
        return 'status-pass';
      case 'FAIL':
        return 'status-fail';
      case 'ERROR':
        return 'status-fail';
      case 'SKIPPED':
        return 'status-pending';
      case null:
      case undefined:
        return 'status-running';
      default:
        return '';
    }
  };

  const getStatusDisplay = (status?: string | null) => {
    if (!status) return 'IN PROGRESS';
    return status;
  };

  // Group tests by upgrade path (from -> to version)
  const groupedTests = validTests.reduce((acc: any[], test) => {
    const fromVersion = normalizeVersion(test.upgrade_start_version);
    const toVersion = normalizeVersion(test.upgrade_target_version);
    const path = `${fromVersion} → ${toVersion}`;
    let group = acc.find(g => g.upgrade_path === path);
    
    if (!group) {
      group = {
        upgrade_path: path,
        from_version: fromVersion,
        to_version: toVersion,
        tests: []
      };
      acc.push(group);
    }
    
    group.tests.push(test);
    return acc;
  }, []);

  // Sort groups by version (newest first)
  groupedTests.sort((a, b) => {
    const versionCompare = (b.to_version || '').localeCompare(a.to_version || '');
    if (versionCompare !== 0) return versionCompare;
    return (b.from_version || '').localeCompare(a.from_version || '');
  });

  // Create matrix view - latest test for each OS/Hypervisor combination per upgrade path
  const createMatrixForGroup = (group: GroupedTest) => {
    const osSet = new Set<string>();
    const hypervisorSet = new Set<string>();
    const latestTests: { [key: string]: UpgradeTestResult } = {};

    // Find latest test for each OS + Hypervisor combination
    group.tests.forEach(test => {
      const os = test.management_server_os || 'Unknown';
      const hypervisor = `${test.hypervisor || 'Unknown'}${test.hypervisor_version ? ` (${test.hypervisor_version})` : ''}`;
      const key = `${os}|${hypervisor}`;
      
      osSet.add(os);
      hypervisorSet.add(hypervisor);
      
      // Keep only the latest test (by timestamp)
      if (!latestTests[key] || 
          new Date(test.timestamp_start) > new Date(latestTests[key].timestamp_start)) {
        latestTests[key] = test;
      }
    });

    const osList = Array.from(osSet).sort();
    const hypervisorList = Array.from(hypervisorSet).sort();

    return { osList, hypervisorList, latestTests };
  };

  const fromVersions = filters?.versions
    ? Array.from(new Set(filters.versions.map(v => v.upgrade_start_version))).sort().reverse()
    : [];
  
  const toVersions = filters?.versions
    ? Array.from(new Set(filters.versions.map(v => v.upgrade_target_version))).sort().reverse()
    : [];

  return (
    <div className="upgrade-tests">
      <div className="header-row">
        <h2>Upgrade Tests</h2>
        <div className="view-toggle">
          <button 
            className={`toggle-btn ${viewMode === 'matrix' ? 'active' : ''}`}
            onClick={() => setViewMode('matrix')}
          >
            Matrix View
          </button>
          <button 
            className={`toggle-btn ${viewMode === 'grouped' ? 'active' : ''}`}
            onClick={() => setViewMode('grouped')}
          >
            Detailed View
          </button>
          <button 
            className={`toggle-btn ${viewMode === 'history' ? 'active' : ''}`}
            onClick={() => setViewMode('history')}
          >
            Historical Runs
          </button>
        </div>
      </div>
      
      {/* Stats Summary */}
      {stats && (
        <div className="upgrade-stats">
          <div className="stat-card">
            <h3>{stats.total}</h3>
            <p>Total Tests</p>
          </div>
          <div className="stat-card pass">
            <h3>{stats.passed}</h3>
            <p>Passed</p>
          </div>
          <div className="stat-card fail">
            <h3>{stats.failed}</h3>
            <p>Failed</p>
          </div>
          <div className="stat-card fail">
            <h3>{stats.error}</h3>
            <p>Error</p>
          </div>
          <div className="stat-card running">
            <h3>{stats.running}</h3>
            <p>In Progress</p>
          </div>
          {stats.latest_test_date && (
            <div className="stat-card">
              <h3>{new Date(stats.latest_test_date).toLocaleDateString()}</h3>
              <p>Latest Test</p>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="upgrade-filters">
        <h3>Filters</h3>
        <div className="filter-row">
          <select
            value={selectedFilters.fromVersion}
            onChange={(e) => handleFilterChange('fromVersion', e.target.value)}
            disabled={loading}
          >
            <option value="">From Version (All)</option>
            {fromVersions.map((version) => (
              <option key={version} value={version}>
                {version}
              </option>
            ))}
          </select>

          <select
            value={selectedFilters.toVersion}
            onChange={(e) => handleFilterChange('toVersion', e.target.value)}
            disabled={loading}
          >
            <option value="">To Version (All)</option>
            {toVersions.map((version) => (
              <option key={version} value={version}>
                {version}
              </option>
            ))}
          </select>

          <select
            value={selectedFilters.distro}
            onChange={(e) => handleFilterChange('distro', e.target.value)}
            disabled={loading}
          >
            <option value="">Management Server OS (All)</option>
            {filters?.distros.map((distro) => (
              <option key={distro} value={distro}>
                {distro}
              </option>
            ))}
          </select>

          <select
            value={selectedFilters.hypervisor}
            onChange={(e) => handleFilterChange('hypervisor', e.target.value)}
            disabled={loading}
          >
            <option value="">Hypervisor (All)</option>
            {filters?.hypervisors.map((hypervisor) => (
              <option key={hypervisor} value={hypervisor}>
                {hypervisor}
              </option>
            ))}
          </select>

          <select
            value={selectedFilters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            disabled={loading}
          >
            <option value="">Status (All)</option>
            <option value="PASS">PASS</option>
            <option value="FAIL">FAIL</option>
            <option value="ERROR">ERROR</option>
            <option value="SKIPPED">SKIPPED</option>
          </select>

          <button onClick={applyFilters} disabled={loading} className="apply-button">
            Apply
          </button>
          <button onClick={clearFilters} disabled={loading} className="clear-button">
            Clear
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="loading-message">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      ) : (
        <>
          {validTests.length === 0 ? (
            <div className="no-results">
              <p>No upgrade test results found</p>
            </div>
          ) : viewMode === 'matrix' ? (
            /* Matrix View */
            <div className="version-groups">
              {groupedTests.map((group) => {
                const { osList, hypervisorList, latestTests } = createMatrixForGroup(group);
                
                return (
                  <div key={group.upgrade_path} className="version-group">
                    <div className="version-group-header">
                      <h3>
                        Upgrade: <span className="version-badge">{group.from_version}</span> → <span className="version-badge">{group.to_version}</span>
                      </h3>
                      <span className="test-count">{Object.keys(latestTests).length} unique combinations</span>
                    </div>
                    
                    <div className="matrix-table-container">
                      <table className="matrix-table">
                        <thead>
                          <tr>
                            <th className="os-header">Management Server OS</th>
                            {hypervisorList.map(hv => (
                              <th key={hv} className="hypervisor-header">{hv}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {osList.map(os => (
                            <tr key={os}>
                              <td className="os-cell"><strong>{os}</strong></td>
                              {hypervisorList.map(hv => {
                                const key = `${os}|${hv}`;
                                const test = latestTests[key];
                                
                                return (
                                  <td key={hv} className="matrix-cell">
                                    {test ? (
                                      <div className="matrix-cell-content">
                                        <span className={`status-badge-small ${getStatusClass(test.overall_status)}`}>
                                          {getStatusDisplay(test.overall_status)}
                                        </span>
                                        <div className="cell-details">
                                          <span className="cell-time">{formatDate(test.timestamp_start)}</span>
                                          {test.duration_seconds && (
                                            <span className="cell-duration">{Math.round(test.duration_seconds / 60)}m</span>
                                          )}
                                        </div>
                                        <div className="cell-actions">
                                          {test.upgrade_console && (
                                            <a href={test.upgrade_console} target="_blank" rel="noopener noreferrer" title="Console">📋</a>
                                          )}
                                          {test.error_log && (
                                            <a href={test.error_log} target="_blank" rel="noopener noreferrer" title="Logs">📄</a>
                                          )}
                                          {test.upgrade_matrix_url && (
                                            <a href={test.upgrade_matrix_url} target="_blank" rel="noopener noreferrer" title="Matrix">🔗</a>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="no-test">-</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : viewMode === 'history' ? (
            /* Historical Runs View - moved to after history check */
            <div className="history-view">
              <div className="history-table-container">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>From</th>
                      <th>To</th>
                      <th>OS</th>
                      <th>Hypervisor</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validTests.map((test) => (
                      <tr key={test.id}>
                        <td className="compact-cell">{normalizeVersion(test.upgrade_start_version)}</td>
                        <td className="compact-cell">{normalizeVersion(test.upgrade_target_version)}</td>
                        <td className="compact-cell">{test.management_server_os || '-'}</td>
                        <td className="compact-cell">
                          {test.hypervisor || '-'}
                          {test.hypervisor_version && ` (${test.hypervisor_version})`}
                        </td>
                        <td>
                          <span className={`status-badge-small ${getStatusClass(test.overall_status)}`}>
                            {getStatusDisplay(test.overall_status)}
                          </span>
                        </td>
                        <td className="compact-cell">
                          {test.duration_seconds 
                            ? `${Math.round(test.duration_seconds / 60)}m` 
                            : '-'}
                        </td>
                        <td className="compact-cell timestamp-compact">
                          {new Date(test.timestamp_start).toLocaleString('en-US', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="actions-cell-compact">
                          {test.upgrade_console && (
                            <a href={test.upgrade_console} target="_blank" rel="noopener noreferrer" title="Console">📋</a>
                          )}
                          {test.error_log && (
                            <a href={test.error_log} target="_blank" rel="noopener noreferrer" title="Logs">📄</a>
                          )}
                          {test.upgrade_matrix_url && (
                            <a href={test.upgrade_matrix_url} target="_blank" rel="noopener noreferrer" title="Matrix">🔗</a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Grouped/Detailed View */
            <div className="version-groups">
              {groupedTests.map((group) => (
                <div key={group.upgrade_path} className="version-group">
                  <div className="version-group-header">
                    <h3>
                      Upgrade: <span className="version-badge">{group.from_version}</span> → <span className="version-badge">{group.to_version}</span>
                    </h3>
                    <span className="test-count">{group.tests.length} test{group.tests.length !== 1 ? 's' : ''}</span>
                  </div>
                  
                  <div className="results-table-container">
                    <table className="results-table">
                      <thead>
                        <tr>
                          <th>Management Server OS</th>
                          <th>Hypervisor</th>
                          <th>Status</th>
                          <th>Duration</th>
                          <th>Start Time</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.tests.map((test: UpgradeTestResult) => (
                          <tr key={test.id}>
                            <td>
                              <strong>{test.management_server_os || '-'}</strong>
                            </td>
                            <td>
                              <strong>{test.hypervisor || '-'}</strong>
                              {test.hypervisor_version && (
                                <span className="hypervisor-version"> ({test.hypervisor_version})</span>
                              )}
                            </td>
                            <td>
                              <span className={`status-badge ${getStatusClass(test.overall_status)}`}>
                                {getStatusDisplay(test.overall_status)}
                              </span>
                            </td>
                            <td>
                              {test.duration_seconds 
                                ? `${Math.round(test.duration_seconds / 60)} min` 
                                : '-'}
                            </td>
                            <td className="timestamp">{formatDate(test.timestamp_start)}</td>
                            <td className="actions-cell">
                              {test.upgrade_console && (
                                <a
                                  href={test.upgrade_console}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="action-link"
                                  title="View upgrade console"
                                >
                                  Console
                                </a>
                              )}
                              {test.error_log && (
                                <a
                                  href={test.error_log}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="action-link"
                                  title="View error logs"
                                >
                                  Logs
                                </a>
                              )}
                              {test.upgrade_matrix_url && (
                                <a
                                  href={test.upgrade_matrix_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="action-link"
                                  title="View upgrade matrix"
                                >
                                  Matrix
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default UpgradeTests;
