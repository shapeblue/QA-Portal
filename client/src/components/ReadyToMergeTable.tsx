import React from 'react';
import { PRData } from '../types';
import './ReadyToMergeTable.css';

interface ReadyToMergeTableProps {
  prs: PRData[];
}

const ReadyToMergeTable: React.FC<ReadyToMergeTableProps> = ({ prs }) => {
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

  const allTestsPassing = (tests: any[]) => {
    return tests.length > 0 && tests.every(t => t.status === 'OK');
  };

  return (
    <div className="ready-to-merge-table-container">
      <table className="ready-to-merge-table">
        <thead>
          <tr>
            <th>PR #</th>
            <th>Title</th>
            <th>LGTMs</th>
            <th>Tests</th>
            <th>Coverage</th>
            <th>Ready Since</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {prs.map(pr => (
            <tr key={pr.number} className="pr-row">
              <td className="pr-number">
                <a href={pr.url} target="_blank" rel="noopener noreferrer">
                  #{pr.number}
                </a>
              </td>
              <td className="pr-title-cell">
                <a href={pr.url} target="_blank" rel="noopener noreferrer">
                  {pr.title}
                </a>
              </td>
              <td className="lgtm-cell">
                <span className="lgtm-badge">
                  👍 {pr.approvals.approved}
                </span>
              </td>
              <td className="tests-cell">
                {allTestsPassing(pr.smokeTests) ? (
                  <span className="tests-badge passing">
                    ✅ {pr.smokeTests.length}/{pr.smokeTests.length}
                  </span>
                ) : (
                  <span className="tests-badge failing">
                    ❌ {pr.smokeTests.filter(t => t.status === 'OK').length}/{pr.smokeTests.length}
                  </span>
                )}
                <div className="tests-detail">
                  {pr.smokeTests.map((test, idx) => (
                    <span key={idx} className={`test-mini ${test.status.toLowerCase()}`} title={`${test.hypervisor}: ${test.passed}/${test.total}`}>
                      {test.hypervisor.substring(0, 3)}
                    </span>
                  ))}
                </div>
              </td>
              <td className="coverage-cell">
                {pr.codeCoverage ? (
                  <span className="coverage-badge">
                    📊 {pr.codeCoverage.percentage}%
                    {pr.codeCoverage.change !== 0 && (
                      <span className={`coverage-delta ${pr.codeCoverage.change > 0 ? 'positive' : 'negative'}`}>
                        {pr.codeCoverage.change > 0 ? '+' : ''}{pr.codeCoverage.change}%
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="no-data">-</span>
                )}
              </td>
              <td className="ready-since-cell">
                {getReadySince(pr.updatedAt)}
              </td>
              <td className="actions-cell">
                <a href={pr.url} target="_blank" rel="noopener noreferrer" className="btn-view">
                  View
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {prs.length === 0 && (
        <div className="no-results">
          <p>No PRs ready to merge at this time.</p>
          <p className="hint">PRs need 2+ LGTMs, no change requests, and all tests passing.</p>
        </div>
      )}
    </div>
  );
};

export default ReadyToMergeTable;
