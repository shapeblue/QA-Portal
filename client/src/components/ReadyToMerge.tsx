import React, { useState, useEffect } from 'react';
import { PRData } from '../types';
import { api } from '../services/api';
import ReadyToMergeCard from './ReadyToMergeCard';
import ReadyToMergeTable from './ReadyToMergeTable';
import './ReadyToMerge.css';

type ViewMode = 'cards' | 'table';

const ReadyToMerge: React.FC = () => {
  const [prs, setPRs] = useState<PRData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');

  useEffect(() => {
    loadReadyToMergePRs();
  }, []);

  const loadReadyToMergePRs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getReadyToMergePRs();
      setPRs(data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load ready to merge PRs');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadReadyToMergePRs();
  };

  return (
    <div className="ready-to-merge-container">
      <div className="ready-to-merge-header">
        <div className="header-left">
          <h2>
            <span className="header-icon">✅</span>
            Ready to Merge
          </h2>
          <p className="header-description">
            PRs with 2+ LGTMs, no change requests, and all tests passing
          </p>
        </div>
        <div className="header-right">
          <button className="refresh-button" onClick={handleRefresh} disabled={loading}>
            🔄 Refresh
          </button>
          <div className="view-toggle">
            <button
              className={`toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
              title="Card View"
            >
              <span className="toggle-icon">📇</span>
              Cards
            </button>
            <button
              className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table View"
            >
              <span className="toggle-icon">📊</span>
              Table
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading ready to merge PRs...</p>
        </div>
      )}

      {error && (
        <div className="error-container">
          <p className="error-message">⚠️ {error}</p>
          <button onClick={handleRefresh}>Try Again</button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="pr-count">
            <strong>{prs.length}</strong> PR{prs.length !== 1 ? 's' : ''} ready to merge
          </div>

          {viewMode === 'cards' ? (
            <div className="cards-view">
              {prs.map(pr => (
                <ReadyToMergeCard key={pr.number} pr={pr} />
              ))}
              {prs.length === 0 && (
                <div className="no-prs">
                  <div className="no-prs-icon">🎉</div>
                  <h3>No PRs Ready to Merge</h3>
                  <p>All caught up! Check back later for PRs that meet the criteria.</p>
                  <div className="criteria-reminder">
                    <strong>Criteria:</strong>
                    <ul>
                      <li>2 or more LGTM approvals</li>
                      <li>Zero change requests</li>
                      <li>All smoke tests passing</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="table-view">
              <ReadyToMergeTable prs={prs} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ReadyToMerge;
