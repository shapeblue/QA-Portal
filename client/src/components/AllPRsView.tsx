import React, { useState, useEffect } from 'react';
import { PRData } from '../types';
import { api } from '../services/api';
import './AllPRsView.css';

interface PRWithStatus extends PRData {
  meetsApprovalCriteria: boolean;
  meetsTestCriteria: boolean;
  isReadyToMerge: boolean;
  needsTesting: boolean;
}

type FilterType = 'all' | 'ready' | 'has-approvals' | 'has-tests' | 'needs-testing';

type SortField = 'status' | 'number' | 'assignee' | 'lgtms' | 'changes';
type SortDirection = 'asc' | 'desc';

const AllPRsView: React.FC = () => {
  const [prs, setPRs] = useState<PRWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  useEffect(() => {
    loadAllPRs();
  }, []);

  const loadAllPRs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAllOpenPRs();
      
      // Add status flags to each PR
      const prsWithStatus: PRWithStatus[] = data.map(pr => {
        const meetsApprovalCriteria = pr.approvals.approved >= 2 && pr.approvals.changesRequested === 0;
        const hasSmokeTests = pr.smokeTests.length > 0;
        const allTestsPassing = pr.smokeTests.every(test => test.status === 'OK');
        const meetsTestCriteria = hasSmokeTests && allTestsPassing;
        const isReadyToMerge = meetsApprovalCriteria && meetsTestCriteria;
        const needsTesting = pr.labels?.includes('status:needs-testing') || false;
        
        return {
          ...pr,
          meetsApprovalCriteria,
          meetsTestCriteria,
          isReadyToMerge,
          needsTesting,
        };
      });
      
      // Sort by priority: 1. Ready to merge, 2. Has approvals, 3. Waiting for tests, 4. Pending
      prsWithStatus.sort((a, b) => {
        // Determine priority score for each PR
        const getPriority = (pr: PRWithStatus) => {
          if (pr.isReadyToMerge) return 4; // Highest priority
          if (pr.meetsApprovalCriteria) return 3; // Has approvals
          if (pr.needsTesting || pr.meetsTestCriteria) return 2; // Waiting for/has tests
          return 1; // Pending
        };
        
        const aPriority = getPriority(a);
        const bPriority = getPriority(b);
        
        // Sort by priority descending (higher priority first)
        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }
        
        // Within same priority, sort by PR number descending (newer first)
        return b.number - a.number;
      });
      
      setPRs(prsWithStatus);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load PRs');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const displayPRs = (() => {
    let filtered;
    switch (activeFilter) {
      case 'ready':
        filtered = prs.filter(pr => pr.isReadyToMerge);
        break;
      case 'has-approvals':
        filtered = prs.filter(pr => pr.meetsApprovalCriteria);
        break;
      case 'has-tests':
        filtered = prs.filter(pr => pr.meetsTestCriteria);
        break;
      case 'needs-testing':
        filtered = prs.filter(pr => pr.needsTesting);
        break;
      default:
        filtered = prs;
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      // Determine priority score for each PR
      const getPriority = (pr: PRWithStatus) => {
        if (pr.isReadyToMerge) return 4; // Highest priority
        if (pr.meetsApprovalCriteria) return 3; // Has approvals
        if (pr.needsTesting || pr.meetsTestCriteria) return 2; // Waiting for/has tests
        return 1; // Pending
      };
      
      let comparison = 0;
      
      switch (sortField) {
        case 'status':
          const aPriority = getPriority(a);
          const bPriority = getPriority(b);
          comparison = bPriority - aPriority; // Higher priority first
          break;
        case 'number':
          comparison = a.number - b.number;
          break;
        case 'assignee':
          const aAssignee = a.assignees && a.assignees.length > 0 ? a.assignees[0].toLowerCase() : '';
          const bAssignee = b.assignees && b.assignees.length > 0 ? b.assignees[0].toLowerCase() : '';
          comparison = aAssignee.localeCompare(bAssignee);
          break;
        case 'lgtms':
          comparison = a.approvals.approved - b.approvals.approved;
          break;
        case 'changes':
          comparison = a.approvals.changesRequested - b.approvals.changesRequested;
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  })();

  const getReadySince = (updatedAt: string) => {
    const updated = new Date(updatedAt);
    const now = new Date();
    const diffMs = now.getTime() - updated.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays}d`;
    } else if (diffHours > 0) {
      return `${diffHours}h`;
    } else {
      return '<1h';
    }
  };

  const readyCount = prs.filter(pr => pr.isReadyToMerge).length;
  const needsTestingCount = prs.filter(pr => pr.needsTesting).length;

  return (
    <div className="all-prs-container">
      <div className="all-prs-header">
        <div className="header-left">
          <h2>All Open PRs</h2>
          <p className="header-description">
            Showing all open PRs with approval and test status
          </p>
        </div>
        <div className="header-right">
          <button className="refresh-button" onClick={loadAllPRs} disabled={loading}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading PRs...</p>
        </div>
      )}

      {error && (
        <div className="error-container">
          <p className="error-message">⚠️ {error}</p>
          <button onClick={loadAllPRs}>Try Again</button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="stats-summary">
            <div 
              className={`stat-box clickable ${activeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setActiveFilter('all')}
              title="Click to show all PRs"
            >
              <div className="stat-number">{prs.length}</div>
              <div className="stat-label">Total Open</div>
            </div>
            <div 
              className={`stat-box ready clickable ${activeFilter === 'ready' ? 'active' : ''}`}
              onClick={() => setActiveFilter('ready')}
              title="Click to show only ready to merge PRs"
            >
              <div className="stat-number">{readyCount}</div>
              <div className="stat-label">Ready to Merge</div>
            </div>
            <div 
              className={`stat-box clickable ${activeFilter === 'has-approvals' ? 'active' : ''}`}
              onClick={() => setActiveFilter('has-approvals')}
              title="Click to show PRs with 2+ LGTMs"
            >
              <div className="stat-number">{prs.filter(pr => pr.meetsApprovalCriteria).length}</div>
              <div className="stat-label">Has 2+ LGTMs</div>
            </div>
            <div 
              className={`stat-box clickable ${activeFilter === 'has-tests' ? 'active' : ''}`}
              onClick={() => setActiveFilter('has-tests')}
              title="Click to show PRs with all tests passing"
            >
              <div className="stat-number">{prs.filter(pr => pr.meetsTestCriteria).length}</div>
              <div className="stat-label">All Tests Pass</div>
            </div>
            <div 
              className={`stat-box needs-testing clickable ${activeFilter === 'needs-testing' ? 'active' : ''}`}
              onClick={() => setActiveFilter('needs-testing')}
              title="Click to show PRs that need testing"
            >
              <div className="stat-number">{needsTestingCount}</div>
              <div className="stat-label">Needs Testing</div>
            </div>
          </div>

          <div className="table-container">
            <table className="all-prs-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('status')} className="sortable">
                    Status {sortField === 'status' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                  <th onClick={() => handleSort('number')} className="sortable">
                    PR # {sortField === 'number' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                  <th>Title</th>
                  <th onClick={() => handleSort('assignee')} className="sortable">
                    Assignee {sortField === 'assignee' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                  <th onClick={() => handleSort('lgtms')} className="sortable">
                    LGTMs {sortField === 'lgtms' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                  <th onClick={() => handleSort('changes')} className="sortable">
                    Changes Req {sortField === 'changes' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                  <th>Smoketest Results</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {displayPRs.map(pr => (
                  <tr 
                    key={pr.number} 
                    className={`pr-row ${pr.isReadyToMerge ? 'ready-to-merge' : ''}`}
                  >
                    <td className="status-cell">
                      {pr.isReadyToMerge && <span className="status-badge ready" title="Ready to Merge">✅</span>}
                      {!pr.isReadyToMerge && pr.meetsApprovalCriteria && !pr.meetsTestCriteria && (
                        <span className="status-badge partial" title="Has approvals, waiting on tests">🧪</span>
                      )}
                      {!pr.isReadyToMerge && !pr.meetsApprovalCriteria && pr.meetsTestCriteria && (
                        <span className="status-badge partial" title="Tests pass, needs approvals">✓</span>
                      )}
                      {!pr.meetsApprovalCriteria && !pr.meetsTestCriteria && (
                        <span className="status-badge pending" title="Pending">⚠️</span>
                      )}
                    </td>
                    <td className="pr-number-cell">
                      <a href={pr.url} target="_blank" rel="noopener noreferrer">
                        #{pr.number}
                      </a>
                    </td>
                    <td className="pr-title-cell">
                      <a href={pr.url} target="_blank" rel="noopener noreferrer" title={pr.title}>
                        {pr.title}
                      </a>
                    </td>
                    <td className="assignee-cell">
                      {pr.assignees && pr.assignees.length > 0 ? (
                        <div className="assignees">
                          {pr.assignees.map((assignee, idx) => (
                            <a 
                              key={idx}
                              href={`https://github.com/${assignee}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="assignee-link"
                              title={assignee}
                            >
                              @{assignee}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="no-assignee">—</span>
                      )}
                    </td>
                    <td className={`approval-cell ${pr.approvals.approved >= 2 ? 'meets-criteria' : ''}`}>
                      <span className="approval-badge">
                        👍 {pr.approvals.approved}
                      </span>
                    </td>
                    <td className={`changes-cell ${pr.approvals.changesRequested === 0 ? 'meets-criteria' : 'has-issues'}`}>
                      {pr.approvals.changesRequested > 0 ? (
                        <span className="changes-badge">❌ {pr.approvals.changesRequested}</span>
                      ) : (
                        <span className="no-changes">—</span>
                      )}
                    </td>
                    <td className={`tests-cell ${pr.meetsTestCriteria ? 'meets-criteria' : ''}`}>
                      {pr.smokeTests.length > 0 ? (
                        <div className="test-hypervisors">
                          {pr.smokeTests.map((test, idx) => {
                            const hvName = test.hypervisor.toLowerCase();
                            const version = test.version || '';
                            const displayText = version ? `${hvName}-${version}` : hvName;
                            const title = `${test.hypervisor} ${version}: ${test.passed}/${test.total}${test.logsUrl ? ' - Click to download logs' : ''}`;
                            
                            return test.logsUrl ? (
                              <a 
                                key={idx}
                                href={test.logsUrl}
                                className={`hv-badge ${test.status === 'OK' ? 'pass' : 'fail'}`}
                                title={title}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {displayText}
                              </a>
                            ) : (
                              <span 
                                key={idx}
                                className={`hv-badge ${test.status === 'OK' ? 'pass' : 'fail'}`}
                                title={title}
                              >
                                {displayText}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="no-tests">No tests</span>
                      )}
                    </td>
                    <td className="updated-cell">
                      {getReadySince(pr.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {displayPRs.length === 0 && activeFilter === 'ready' && (
            <div className="no-results">
              <p>No PRs are currently ready to merge.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AllPRsView;
