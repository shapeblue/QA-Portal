import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './App.css';
import PRCard from './components/PRCard';
import SearchBar from './components/SearchBar';
import UpgradeTests from './components/UpgradeTests';
import AllPRsView from './components/AllPRsView';
import TestFailuresRouter from './components/TestFailuresRouter';
import RefreshControls from './components/RefreshControls';
import { api } from './services/api';
import { PRData } from './types';

const AUTO_REFRESH_MS = 5 * 60 * 1000;

interface TabCounts {
  allOpen: number;
  flaky: number;
}

// Single source of truth for the displayed app version (shown in header + footer).
const APP_VERSION = 'v1.0.4';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'health' | 'all' | 'upgrade' | 'test-failures'>('health');
  const [healthPRs, setHealthPRs] = useState<PRData[]>([]);
  const [searchResults, setSearchResults] = useState<PRData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState(false);
  const [healthUpdatedAt, setHealthUpdatedAt] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [counts, setCounts] = useState<TabCounts | null>(null);

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

  // Load health PRs + tab counts on mount
  useEffect(() => {
    loadHealthPRs();
    loadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optional auto-refresh of the health tab + counts
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      loadHealthPRs();
      loadCounts();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  const loadHealthPRs = async () => {
    setLoading(true);
    setError(null);
    setSearchMode(false);
    try {
      const prs = await api.getHealthPRs();
      setHealthPRs(prs);
      setHealthUpdatedAt(new Date());
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load health check PRs');
    } finally {
      setLoading(false);
    }
  };

  // Counts shown as tab badges. Non-critical: failures are ignored so a slow
  // count fetch never blocks or errors the main view.
  const loadCounts = async () => {
    try {
      const [allPrs, flaky] = await Promise.all([
        api.getAllOpenPRs(),
        api.getFlakyTests(),
      ]);
      const flakyCount = Array.isArray(flaky)
        ? flaky.reduce((sum, file: any) => sum + (file.tests?.length || 0), 0)
        : 0;
      setCounts({ allOpen: allPrs.length, flaky: flakyCount });
    } catch {
      /* counts are best-effort */
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
            <p className="subtitle">Monitor health checks and quality metrics for CloudStack [{APP_VERSION}]</p>
          </div>
        </div>
      </header>

      <div className="tab-navigation">
        <button
          className={`tab-button ${activeTab === 'health' ? 'active' : ''}`}
          onClick={() => setActiveTab('health')}
        >
          Health Check Runs
          {!searchMode && <span className="tab-count">{healthPRs.length}</span>}
        </button>
        <button
          className={`tab-button ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          All Open PRs
          {counts && <span className="tab-count">{counts.allOpen}</span>}
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
          Flaky Tests
          {counts && <span className="tab-count">{counts.flaky}</span>}
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

            {loading && displayPRs.length === 0 ? (
              <div className="loading-message">
                <div className="spinner"></div>
                <p>Loading...</p>
              </div>
            ) : (
              <>
                {/* Non-blanking refresh: keep existing content, show a slim bar */}
                {loading && <div className="top-progress-bar" />}
                <div className="pr-list-header">
                  <h2>
                    {searchMode
                      ? 'Search Results'
                      : 'Active Health Check Runs'}
                  </h2>
                  {!searchMode && (
                    <RefreshControls
                      lastUpdated={healthUpdatedAt}
                      loading={loading}
                      onRefresh={handleRefresh}
                      autoRefresh={autoRefresh}
                      onToggleAutoRefresh={setAutoRefresh}
                    />
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
        <p>QA Portal - Health Check Dashboard | {APP_VERSION}</p>
      </footer>
    </div>
  );
}

export default App;
