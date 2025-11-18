import React from 'react';
import { PRData } from '../types';
import './PRCard.css';

interface PRCardProps {
  pr: PRData;
}

const PRCard: React.FC<PRCardProps> = ({ pr }) => {
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

  return (
    <div className="pr-card">
      <div className="pr-card-header">
        <h3>
          <a href={pr.url} target="_blank" rel="noopener noreferrer">
            PR #{pr.number}
          </a>
        </h3>
        <p className="pr-title">{pr.title}</p>
      </div>

      <div className="pr-card-body">
        {/* Approvals */}
        <div className="pr-section">
          <h4>LGTMs:</h4>
          <div className="approval-stats">
            <span className="approval-item approved">
              Approve: {pr.approvals.approved}
            </span>
            <span className="approval-item commented">
              Comment: {pr.approvals.commented}
            </span>
            <span className="approval-item rejected">
              Reject: {pr.approvals.changesRequested}
            </span>
          </div>
        </div>

        {/* Smoke Tests */}
        {pr.smokeTests && pr.smokeTests.length > 0 && (
          <div className="pr-section">
            <h4>Smoketests:</h4>
            <div className="smoketest-results">
              {pr.smokeTests.map((test, index) => (
                <div
                  key={index}
                  className={`smoketest-item ${test.status.toLowerCase()}`}
                >
                  <span className="hypervisor">{test.hypervisor}:</span>
                  <span className="result">
                    {test.status} {test.passed}/{test.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Logs */}
        {pr.logsUrl && (
          <div className="pr-section">
            <h4>Logs:</h4>
            <a
              href={pr.logsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="logs-link"
            >
              View Logs
            </a>
          </div>
        )}

        {/* Code Coverage */}
        {pr.codeCoverage && (
          <div className="pr-section">
            <h4>Code Coverage:</h4>
            <div className="coverage-info">
              <span>
                {pr.codeCoverage.percentage}%
                {pr.codeCoverage.change !== 0 && (
                  <span
                    className={
                      pr.codeCoverage.change > 0 ? 'positive' : 'negative'
                    }
                  >
                    {' '}
                    ({pr.codeCoverage.change > 0 ? '+' : ''}
                    {pr.codeCoverage.change}%)
                  </span>
                )}
              </span>
              {pr.codeCoverage.url && (
                <a
                  href={pr.codeCoverage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="coverage-link"
                >
                  Details
                </a>
              )}
            </div>
          </div>
        )}

        {/* Date */}
        <div className="pr-section pr-date">
          <span>Updated: {formatDate(pr.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
};

export default PRCard;
