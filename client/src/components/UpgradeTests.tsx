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
  const [viewMode, setViewMode] = useState<'heatmap' | 'history' | 'accordion'>('heatmap');
  const [selectedHeatmapCell, setSelectedHeatmapCell] = useState<{from: string, to: string} | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [expandedTests, setExpandedTests] = useState<Set<number>>(new Set());
  
  const [selectedFilters, setSelectedFilters] = useState({
    fromVersion: '',
    toVersion: '',
    distro: '',
    hypervisor: '',
    status: '',
  });

  // OS name mapping function
  const formatOSName = (osCode: string | null | undefined): string => {
    if (!osCode) return '-';
    
    const osMap: { [key: string]: string } = {
      // Ubuntu
      'u20': 'Ubuntu 20.04',
      'u22': 'Ubuntu 22.04',
      'u24': 'Ubuntu 24.04',
      // Oracle Linux
      'ol8': 'Oracle Linux 8',
      'ol9': 'Oracle Linux 9',
      'ol10': 'Oracle Linux 10',
      // Rocky Linux
      'r8': 'Rocky Linux 8',
      'r9': 'Rocky Linux 9',
      'r10': 'Rocky Linux 10',
      // AlmaLinux
      'a8': 'AlmaLinux 8',
      'a9': 'AlmaLinux 9',
      'a10': 'AlmaLinux 10',
      // Debian
      'd12': 'Debian 12',
      // SUSE
      's15': 'OpenSUSE 15',
    };
    
    return osMap[osCode.toLowerCase()] || osCode;
  };

  // Hypervisor version mapping function
  const formatHypervisorVersion = (hvVersion: string | null | undefined): string => {
    if (!hvVersion) return '';
    
    const hvMap: { [key: string]: string } = {
      // KVM/Ubuntu
      'ubuntu20': 'Ubuntu 20.04',
      'ubuntu22': 'Ubuntu 22.04',
      'ubuntu24': 'Ubuntu 24.04',
      // KVM/Oracle Linux
      'ol8': 'Oracle Linux 8',
      'ol9': 'Oracle Linux 9',
      'ol10': 'Oracle Linux 10',
      // KVM/Rocky Linux
      'rocky8': 'Rocky Linux 8',
      'rocky9': 'Rocky Linux 9',
      'rocky10': 'Rocky Linux 10',
      // KVM/AlmaLinux
      'alma8': 'AlmaLinux 8',
      'alma9': 'AlmaLinux 9',
      'alma10': 'AlmaLinux 10',
      'a10': 'AlmaLinux 10',
      // KVM/Debian
      'debian12': 'Debian 12',
      'd12': 'Debian 12',
      // KVM/SUSE
      'sles15': 'SLES 15',
      's15': 'SLES 15',
      // VMware versions
      '70u3': 'vSphere 7.0 U3',
      '80u3': 'vSphere 8.0 U3',
      '80u2': 'vSphere 8.0 U2',
      // XCP-ng versions
      'xcpng82': 'XCP-ng 8.2',
      'xcpng83': 'XCP-ng 8.3',
    };
    
    return hvMap[hvVersion.toLowerCase()] || hvVersion;
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async (retryCount = 0) => {
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
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load upgrade tests';
      
      // Retry on timeout errors (up to 2 retries)
      if (errorMessage.includes('ETIMEDOUT') && retryCount < 2) {
        console.log(`Retrying... (attempt ${retryCount + 1})`);
        setTimeout(() => loadInitialData(retryCount + 1), 2000);
        return;
      }
      
      setError(errorMessage);
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

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  const togglePathExpansion = (path: string) => {
    setExpandedPaths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const toggleTestExpansion = (testId: number) => {
    setExpandedTests(prev => {
      const newSet = new Set(prev);
      if (newSet.has(testId)) {
        newSet.delete(testId);
      } else {
        newSet.add(testId);
      }
      return newSet;
    });
  };

  const formatFailureStage = (stage: string | null | undefined): string => {
    if (!stage) return '';
    
    const stageMap: { [key: string]: string } = {
      'environment_setup': 'Environment Setup',
      'upgrade_execution': 'Upgrade Execution',
      'post_upgrade_verification': 'Post-Upgrade Verification',
      'upgrade': 'Upgrade Process',
      'build': 'Build Process',
    };
    
    return stageMap[stage.toLowerCase()] || stage;
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
      const os = formatOSName(test.management_server_os);
      const hypervisor = `${test.hypervisor || 'Unknown'}${test.hypervisor_version ? ` (${formatHypervisorVersion(test.hypervisor_version)})` : ''}`;
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

  // Create heatmap data structure
  const createHeatmapData = () => {
    const heatmapGrid: { [key: string]: { total: number, passed: number, failed: number, running: number, tests: UpgradeTestResult[] } } = {};
    
    validTests.forEach(test => {
      const fromVersion = normalizeVersion(test.upgrade_start_version);
      const toVersion = normalizeVersion(test.upgrade_target_version);
      const key = `${fromVersion}->${toVersion}`;
      
      if (!heatmapGrid[key]) {
        heatmapGrid[key] = { total: 0, passed: 0, failed: 0, running: 0, tests: [] };
      }
      
      heatmapGrid[key].total++;
      heatmapGrid[key].tests.push(test);
      
      if (test.overall_status === 'PASS') {
        heatmapGrid[key].passed++;
      } else if (test.overall_status === 'FAIL' || test.overall_status === 'ERROR') {
        heatmapGrid[key].failed++;
      } else if (!test.overall_status || !test.timestamp_end) {
        heatmapGrid[key].running++;
      }
    });
    
    return heatmapGrid;
  };

  const heatmapData = createHeatmapData();
  
  // Get unique from/to versions for heatmap
  const heatmapFromVersions = Array.from(new Set(validTests.map(t => normalizeVersion(t.upgrade_start_version)))).sort();
  const heatmapToVersions = Array.from(new Set(validTests.map(t => normalizeVersion(t.upgrade_target_version)))).sort();

  const getHeatmapCellColor = (passRate: number, hasRunning: boolean) => {
    if (hasRunning) return 'cell-running';
    if (passRate >= 90) return 'cell-pass-high';
    if (passRate >= 70) return 'cell-pass-med';
    if (passRate >= 50) return 'cell-pass-low';
    return 'cell-fail';
  };

  return (
    <div className="upgrade-tests">
      <div className="header-row">
        <h2>Upgrade Tests</h2>
        <div className="view-toggle">
          <button 
            className={`toggle-btn ${viewMode === 'heatmap' ? 'active' : ''}`}
            onClick={() => setViewMode('heatmap')}
          >
            🗺️ Heatmap
          </button>
          <button 
            className={`toggle-btn ${viewMode === 'accordion' ? 'active' : ''}`}
            onClick={() => setViewMode('accordion')}
          >
            All Upgrade Paths
          </button>
          <button 
            className={`toggle-btn ${viewMode === 'history' ? 'active' : ''}`}
            onClick={() => setViewMode('history')}
          >
            Historical Runs
          </button>
        </div>
      </div>

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
          ) : viewMode === 'accordion' ? (
            /* Accordion View */
            <div className="accordion-view">
              {groupedTests.map((group) => {
                const isExpanded = expandedPaths.has(group.upgrade_path);
                const passCount = group.tests.filter((t: UpgradeTestResult) => t.overall_status === 'PASS').length;
                const failCount = group.tests.filter((t: UpgradeTestResult) => t.overall_status === 'FAIL').length;
                const errorCount = group.tests.filter((t: UpgradeTestResult) => t.overall_status === 'ERROR').length;
                const runningCount = group.tests.filter((t: UpgradeTestResult) => !t.overall_status).length;
                
                return (
                  <div key={group.upgrade_path} className="accordion-item">
                    <div 
                      className="accordion-header"
                      onClick={() => togglePathExpansion(group.upgrade_path)}
                    >
                      <span className="accordion-icon">{isExpanded ? '▼' : '▶'}</span>
                      <span className="accordion-title">
                        <span className="version-badge from">{group.from_version}</span>
                        <span className="arrow">→</span>
                        <span className="version-badge to">{group.to_version}</span>
                      </span>
                      <span className="accordion-summary">
                        ({group.tests.length} test{group.tests.length !== 1 ? 's' : ''}:
                        {passCount > 0 && <span className="summary-pass"> {passCount} pass</span>}
                        {failCount > 0 && <span className="summary-fail"> {failCount} fail</span>}
                        {errorCount > 0 && <span className="summary-error"> {errorCount} error</span>}
                        {runningCount > 0 && <span className="summary-running"> {runningCount} running</span>})
                      </span>
                    </div>
                    
                    {isExpanded && (
                      <div className="accordion-content">
                        {group.tests.map((test: UpgradeTestResult) => {
                          const statusIcon = test.overall_status === 'PASS' ? '✓' : 
                                           test.overall_status === 'FAIL' ? '✗' : 
                                           test.overall_status === 'ERROR' ? '⚠' : '⏳';
                          const durationMin = test.duration_seconds ? Math.round(test.duration_seconds / 60) : null;
                          const hasFailureInfo = (test.overall_status === 'FAIL' || test.overall_status === 'ERROR') && 
                                                (test.failure_stage || test.error_log);
                          const isTestExpanded = expandedTests.has(test.id);
                          
                          return (
                            <div key={test.id}>
                              <div 
                                className={`accordion-test-item ${getStatusClass(test.overall_status)} ${hasFailureInfo ? 'clickable' : ''}`}
                                onClick={() => hasFailureInfo && toggleTestExpansion(test.id)}
                              >
                                {hasFailureInfo && (
                                  <span className="test-expand-icon">{isTestExpanded ? '▼' : '▶'}</span>
                                )}
                                <span className="test-status-icon">{statusIcon}</span>
                                <span className="test-info">
                                  <strong>{formatOSName(test.management_server_os)}</strong> + {test.hypervisor || '-'}
                                  {test.hypervisor_version && ` (${formatHypervisorVersion(test.hypervisor_version)})`}
                                </span>
                                <span className={`test-status ${getStatusClass(test.overall_status)}`}>
                                  {getStatusDisplay(test.overall_status)}
                                </span>
                                <span className="test-data-checkbox" title="Test data was created during upgrade">
                                  <input 
                                    type="checkbox" 
                                    checked={test.tests_data_created === 'true'} 
                                    readOnly 
                                    disabled 
                                  />
                                  <label>Test Data</label>
                                </span>
                                {durationMin && <span className="test-duration">{durationMin}m</span>}
                                <span className="test-actions">
                                  {test.upgrade_console && (
                                    <a href={test.upgrade_console} target="_blank" rel="noopener noreferrer" title="Console" onClick={(e) => e.stopPropagation()}>📋</a>
                                  )}
                                  {test.error_log && (
                                    <a href={test.error_log} target="_blank" rel="noopener noreferrer" title="Logs" onClick={(e) => e.stopPropagation()}>📄</a>
                                  )}
                                  {test.upgrade_matrix_url && (
                                    <a href={test.upgrade_matrix_url} target="_blank" rel="noopener noreferrer" title="Matrix" onClick={(e) => e.stopPropagation()}>🔗</a>
                                  )}
                                </span>
                              </div>
                              
                              {isTestExpanded && hasFailureInfo && (
                                <div className="test-failure-details">
                                  {test.failure_stage && (
                                    <div className="failure-stage">
                                      <strong>Failed at:</strong> {formatFailureStage(test.failure_stage)}
                                    </div>
                                  )}
                                  {test.error_log && (
                                    <div className="failure-log">
                                      <strong>Error Log:</strong>{' '}
                                      <a href={test.error_log} target="_blank" rel="noopener noreferrer">
                                        View full error log →
                                      </a>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : viewMode === 'heatmap' ? (
            /* Heatmap View */
            <div className="heatmap-view">
              <div className="heatmap-container">
                <h3>Upgrade Path Success Matrix</h3>
                <div className="heatmap-grid">
                  <div className="heatmap-header">
                    <div className="heatmap-corner">From ↓ / To →</div>
                    {heatmapToVersions.map(toVer => (
                      <div key={toVer} className="heatmap-col-header">
                        <strong>{toVer}</strong>
                      </div>
                    ))}
                  </div>
                  
                  {heatmapFromVersions.map(fromVer => (
                    <div key={fromVer} className="heatmap-row">
                      <div className="heatmap-row-header"><strong>{fromVer}</strong></div>
                      {heatmapToVersions.map(toVer => {
                        const key = `${fromVer}->${toVer}`;
                        const cellData = heatmapData[key];
                        
                        if (!cellData || cellData.total === 0) {
                          return (
                            <div key={toVer} className="heatmap-cell heatmap-cell-empty">
                              <span className="cell-empty-text">n/a</span>
                            </div>
                          );
                        }
                        
                        const passRate = (cellData.passed / cellData.total) * 100;
                        const hasRunning = cellData.running > 0;
                        const colorClass = getHeatmapCellColor(passRate, hasRunning);
                        
                        return (
                          <div 
                            key={toVer} 
                            className={`heatmap-cell heatmap-cell-clickable ${colorClass}`}
                            onClick={() => setSelectedHeatmapCell({ from: fromVer, to: toVer })}
                          >
                            <span className="cell-percentage">
                              {hasRunning ? '⏳' : `${Math.round(passRate)}%`}
                            </span>
                            <span className="cell-test-count">
                              {cellData.passed}/{cellData.total} passed
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Legend removed */}

              {/* Detail Panel */}
              {selectedHeatmapCell && (() => {
                const key = `${selectedHeatmapCell.from}->${selectedHeatmapCell.to}`;
                const cellData = heatmapData[key];
                
                if (!cellData) return null;
                
                // Create mini matrix for this path
                const miniGroup = groupedTests.find(g => 
                  g.from_version === selectedHeatmapCell.from && 
                  g.to_version === selectedHeatmapCell.to
                );
                
                if (!miniGroup) return null;
                
                const { osList, hypervisorList, latestTests } = createMatrixForGroup(miniGroup);
                
                return (
                  <div className="heatmap-detail-panel">
                    <div className="detail-panel-header">
                      <h3>📊 Detailed View: {selectedHeatmapCell.from} → {selectedHeatmapCell.to}</h3>
                      <button 
                        className="close-detail-btn"
                        onClick={() => setSelectedHeatmapCell(null)}
                      >
                        ✕ Close
                      </button>
                    </div>
                    
                    <div className="mini-matrix-container">
                      <table className="mini-matrix-table">
                        <thead>
                          <tr>
                            <th>OS</th>
                            {hypervisorList.map(hv => (
                              <th key={hv}>{hv}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {osList.map(os => (
                            <tr key={os}>
                              <td><strong>{os}</strong></td>
                              {hypervisorList.map(hv => {
                                const key = `${os}|${hv}`;
                                const test = latestTests[key];
                                
                                return (
                                  <td key={hv}>
                                    {test ? (
                                      <div className="heatmap-cell-content">
                                        <span className={`status-badge-small ${getStatusClass(test.overall_status)}`}>
                                          {getStatusDisplay(test.overall_status)}
                                        </span>
                                        <div className="heatmap-data-check">
                                          <input 
                                            type="checkbox" 
                                            checked={test.tests_data_created === 'true'} 
                                            readOnly 
                                            disabled 
                                            title="Test data was created during upgrade"
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="empty">-</span>
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
              })()}
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
                      <th title="Test data was created during upgrade">Test Data</th>
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
                        <td className="compact-cell">{formatOSName(test.management_server_os)}</td>
                        <td className="compact-cell">
                          {test.hypervisor || '-'}
                          {test.hypervisor_version && ` (${formatHypervisorVersion(test.hypervisor_version)})`}
                        </td>
                        <td>
                          <span className={`status-badge-small ${getStatusClass(test.overall_status)}`}>
                            {getStatusDisplay(test.overall_status)}
                          </span>
                        </td>
                        <td className="compact-cell">
                          <input 
                            type="checkbox" 
                            checked={test.tests_data_created === 'true'} 
                            readOnly 
                            disabled 
                            title="Test data was created during upgrade"
                          />
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
          ) : null}
        </>
      )}
    </div>
  );
};

export default UpgradeTests;
