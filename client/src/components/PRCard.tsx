import React, { useState } from 'react';
import { PRData } from '../types';
import './PRCard.css';

interface PRCardProps {
  pr: PRData;
}

const PRCard: React.FC<PRCardProps> = ({ pr }) => {
  const [expandedTests, setExpandedTests] = useState<Set<number>>(new Set());

  const toggleTest = (index: number) => {
    setExpandedTests(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
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
              {pr.smokeTests.map((test, index) => {
                const hasFailures = test.status === 'FAIL';
                const canExpand = hasFailures && test.failedTests !== undefined;
                
                return (
                  <div key={index} className="smoketest-wrapper">
                    <div
                      className={`smoketest-item ${test.status.toLowerCase()} ${canExpand ? 'expandable' : ''}`}
                      onClick={() => canExpand && toggleTest(index)}
                    >
                      {canExpand && (
                        <span className="expand-icon">
                          {expandedTests.has(index) ? '▼' : '▶'}
                        </span>
                      )}
                      <span className="hypervisor">{test.hypervisor}:</span>
                      <span className="result">
                        {test.status} {test.passed}/{test.total}
                      </span>
                      {test.createdAt && (
                        <span className="test-date">
                          {formatDate(test.createdAt)}
                        </span>
                      )}
                      {test.logsUrl && (
                        <a
                          href={test.logsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hypervisor-logs-icon"
                          title="Download logs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          📥
                        </a>
                      )}
                    </div>
                    {expandedTests.has(index) && canExpand && (
                      <div className="failed-tests-list">
                        {test.failedTests && test.failedTests.length > 0 ? (
                          <>
                            <div className="failed-tests-header">
                              Failed Tests ({test.failedTests.length} unique{test.total - test.passed !== test.failedTests.length ? `, ${test.total - test.passed} total failures` : ''}):
                            </div>
                            <ul className="failed-tests">
                              {test.failedTests.map((testName, testIndex) => (
                                <li key={testIndex} className="failed-test-name">
                                  {testName}
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : (
                          <div className="failed-tests-header">
                            {test.total - test.passed} test(s) failed. Unable to parse test names from comment. Check logs for details.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
