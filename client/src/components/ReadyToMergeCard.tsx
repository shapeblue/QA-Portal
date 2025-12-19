import React from 'react';
import { PRData } from '../types';
import './ReadyToMergeCard.css';

interface ReadyToMergeCardProps {
  pr: PRData;
}

const ReadyToMergeCard: React.FC<ReadyToMergeCardProps> = ({ pr }) => {
  // Calculate how long PR has been ready
  const getReadySince = () => {
    const updated = new Date(pr.updatedAt);
    const now = new Date();
    const diffMs = now.getTime() - updated.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else {
      return 'just now';
    }
  };

  return (
    <div className="ready-to-merge-card">
      <div className="ready-badge">
        <span className="badge-icon">✅</span>
        <span className="badge-text">READY TO MERGE</span>
      </div>

      <div className="pr-header">
        <h3 className="pr-title">
          <a href={pr.url} target="_blank" rel="noopener noreferrer">
            PR #{pr.number}: {pr.title}
          </a>
        </h3>
      </div>

      <div className="pr-stats">
        <div className="stat-item approvals">
          <span className="stat-icon">👍</span>
          <span className="stat-value">{pr.approvals.approved}</span>
          <span className="stat-label">LGTMs</span>
        </div>
        
        {pr.approvals.changesRequested > 0 && (
          <div className="stat-item rejections">
            <span className="stat-icon">❌</span>
            <span className="stat-value">{pr.approvals.changesRequested}</span>
            <span className="stat-label">Changes Requested</span>
          </div>
        )}
        
        {pr.approvals.commented > 0 && (
          <div className="stat-item comments">
            <span className="stat-icon">💬</span>
            <span className="stat-value">{pr.approvals.commented}</span>
            <span className="stat-label">Comments</span>
          </div>
        )}
      </div>

      <div className="smoke-tests">
        {pr.smokeTests.map((test, index) => (
          <div key={index} className={`test-result ${test.status.toLowerCase()}`}>
            <span className="test-icon">
              {test.status === 'OK' ? '✅' : '❌'}
            </span>
            <span className="test-name">{test.hypervisor}</span>
            <span className="test-score">
              ({test.passed}/{test.total})
            </span>
          </div>
        ))}
      </div>

      {pr.codeCoverage && (
        <div className="code-coverage">
          <span className="coverage-icon">📊</span>
          <span className="coverage-value">{pr.codeCoverage.percentage}%</span>
          <span className="coverage-label">Coverage</span>
          {pr.codeCoverage.change !== 0 && (
            <span className={`coverage-change ${pr.codeCoverage.change > 0 ? 'positive' : 'negative'}`}>
              ({pr.codeCoverage.change > 0 ? '+' : ''}{pr.codeCoverage.change}%)
            </span>
          )}
        </div>
      )}

      <div className="pr-footer">
        <div className="ready-since">
          <span className="footer-label">Ready since:</span>
          <span className="footer-value">{getReadySince()}</span>
        </div>
        <div className="pr-actions">
          <a href={pr.url} target="_blank" rel="noopener noreferrer" className="btn-primary">
            View on GitHub
          </a>
        </div>
      </div>
    </div>
  );
};

export default ReadyToMergeCard;
