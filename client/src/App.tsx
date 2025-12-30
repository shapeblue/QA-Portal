import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import './App.css';
import PRCard from './components/PRCard';
import SearchBar from './components/SearchBar';
import UpgradeTests from './components/UpgradeTests';
import AllPRsView from './components/AllPRsView';
import TestFailuresRouter from './components/TestFailuresRouter';
import { api } from './services/api';
import { PRData } from './types';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'health' | 'all' | 'upgrade' | 'test-failures'>('health');
  const [healthPRs, setHealthPRs] = useState<PRData[]>([]);
  const [searchResults, setSearchResults] = useState<PRData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState(false);

  // Sync activeTab with URL
  useEffect(() => {
    if (location.pathname.startsWith('/test-failures')) {
      setActiveTab('test-failures');
    } else if (location.pathname === '/all-prs') {
      setActiveTab('all');
    } else if (location.pathname === '/upgrade-tests') {
      setActiveTab('upgrade');
    } else {
      setActiveTab('health');
    }
  }, [location.pathname]);

  // Load health PRs on mount
  useEffect(() => {
    loadHealthPRs();
  }, []);

  const loadHealthPRs = async () => {
    setLoading(true);
    setError(null);
    setSearchMode(false);
    try {
      const prs = await api.getHealthPRs();
      setHealthPRs(prs);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load health check PRs');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    const prNumber = api.parsePRNumber(query);
    
    if (!prNumber) {
      setError('Invalid PR number or URL');
      return;
    }

    setLoading(true);
    setError(null);
    setSearchMode(true);
    try {
      const pr = await api.getPR(prNumber);
      setSearchResults([pr]);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch PR');
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadHealthPRs();
  };

  const displayPRs = searchMode ? searchResults : healthPRs;

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-content">
          <img src="/cloudstack-logo-color.svg" alt="Apache CloudStack" className="cloudstack-logo" />
          <div className="header-text">
            <h1>CloudStack PR Health Dashboard</h1>
            <p className="subtitle">Monitor health checks and quality metrics for CloudStack [v0.1.1]</p>
          </div>
        </div>
      </header>

      <div className="tab-navigation">
        <button
          className={`tab-button ${activeTab === 'health' ? 'active' : ''}`}
          onClick={() => setActiveTab('health')}
        >
          Health Check Runs
        </button>
        <button
          className={`tab-button ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          📋 All Open PRs
        </button>
        <button
          className={`tab-button ${activeTab === 'upgrade' ? 'active' : ''}`}
          onClick={() => setActiveTab('upgrade')}
        >
          Upgrade Tests
        </button>
        <button
          className={`tab-button ${activeTab === 'test-failures' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('test-failures');
            navigate('/test-failures');
          }}
        >
          🧪 Flaky Tests
        </button>
      </div>

      <main className="app-content">
        {activeTab === 'health' ? (
          <div className="health-tab">
            <div className="search-section">
              <SearchBar onSearch={handleSearch} loading={loading} />
              {searchMode && (
                <button className="back-button" onClick={handleRefresh}>
                  ← Back to Health Check PRs
                </button>
              )}
            </div>

            {error && (
              <div className="error-message">
                <strong>Error:</strong> {error}
              </div>
            )}

            {loading ? (
              <div className="loading-message">
                <div className="spinner"></div>
                <p>Loading...</p>
              </div>
            ) : (
              <>
                <div className="pr-list-header">
                  <h2>
                    {searchMode
                      ? 'Search Results'
                      : 'Active Health Check Runs'}
                  </h2>
                  {!searchMode && (
                    <button className="refresh-button" onClick={handleRefresh}>
                      ↻ Refresh
                    </button>
                  )}
                </div>

                {displayPRs.length === 0 ? (
                  <div className="no-results">
                    <p>
                      {searchMode
                        ? 'No PR found'
                        : 'No active health check PRs found'}
                    </p>
                  </div>
                ) : (
                  <div className="pr-grid">
                    {displayPRs.map((pr) => (
                      <PRCard key={pr.number} pr={pr} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : activeTab === 'all' ? (
          <AllPRsView />
        ) : activeTab === 'test-failures' ? (
          <TestFailuresRouter />
        ) : (
          <UpgradeTests />
        )}
      </main>

      <footer className="app-footer">
        <p>QA Portal - Health Check Dashboard | v1.0.2</p>
      </footer>
    </div>
  );
}

export default App;
