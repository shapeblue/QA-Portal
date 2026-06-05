import React from 'react';
import { timeAgo, useNow } from '../utils/time';
import './RefreshControls.css';

interface RefreshControlsProps {
  lastUpdated: Date | null;
  loading: boolean;
  onRefresh: () => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: (value: boolean) => void;
}

/**
 * Freshness indicator + auto-refresh toggle + refresh button. Shared across
 * tabs so the refresh affordance and styling are consistent.
 */
const RefreshControls: React.FC<RefreshControlsProps> = ({
  lastUpdated,
  loading,
  onRefresh,
  autoRefresh,
  onToggleAutoRefresh,
}) => {
  useNow(30000); // keep the "updated Xm ago" label current

  return (
    <div className="refresh-controls">
      <span className="last-updated" aria-live="polite">
        {loading ? 'Refreshing…' : `Updated ${timeAgo(lastUpdated)}`}
      </span>
      <label className="auto-refresh-toggle" title="Reload automatically every 5 minutes">
        <input
          type="checkbox"
          checked={autoRefresh}
          onChange={(e) => onToggleAutoRefresh(e.target.checked)}
        />
        Auto
      </label>
      <button className="refresh-btn" onClick={onRefresh} disabled={loading}>
        ↻ Refresh
      </button>
    </div>
  );
};

export default RefreshControls;
