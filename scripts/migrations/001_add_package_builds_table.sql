-- Migration: Add pr_package_builds table for tracking package build status
-- Date: 2026-01-19
-- Purpose: Track BlueOrangutan package builds with staleness detection

-- Create pr_package_builds table
CREATE TABLE IF NOT EXISTS pr_package_builds (
  id INT PRIMARY KEY AUTO_INCREMENT,
  pr_number INT NOT NULL,
  pr_title VARCHAR(500),
  
  -- Package build info
  packages JSON NOT NULL,  -- Array: ["el8", "el9", "debian"] or failed: ["!el8", "!el9"]
  sl_jid INT,
  build_url VARCHAR(500),
  build_status VARCHAR(20) DEFAULT 'success',  -- 'success', 'failed', 'partial'
  
  -- Timestamps for staleness detection (QA ISSUE #1 FIX)
  comment_created_at DATETIME NOT NULL,  -- When bot posted the comment
  comment_id BIGINT NOT NULL,            -- GitHub comment ID for deduplication
  
  -- HEAD commit tracking (QA recommended approach)
  head_commit_sha VARCHAR(40),           -- SHA of PR HEAD commit when build happened
  head_commit_date DATETIME,             -- Date of PR HEAD commit (for staleness check)
  
  -- Staleness computation
  is_stale BOOLEAN DEFAULT FALSE,        -- TRUE if head_commit_date > comment_created_at
  
  -- Metadata
  inserted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes for performance
  INDEX idx_pr_number (pr_number),
  INDEX idx_sl_jid (sl_jid),
  INDEX idx_comment_created (comment_created_at),
  INDEX idx_build_status (build_status),
  
  -- Unique constraint to prevent duplicates
  UNIQUE KEY unique_comment (pr_number, comment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Verify table was created
SELECT 
  'Table created successfully' AS status,
  COUNT(*) as column_count
FROM information_schema.columns 
WHERE table_schema = DATABASE()
AND table_name = 'pr_package_builds';
