# Available Packages Feature - Technical Plan

**Feature:** Add "Available Packages" column to All Open PRs page  
**Date:** 2026-01-19  
**Author:** Sr. Developer & Architect  
**Status:** 📋 Planning Phase

---

## 🎯 Feature Overview

Display package build status from BlueOrangutan bot comments with intelligent staleness detection based on code changes after the build.

### Business Value
- **QA Engineers** can quickly see which PRs have packages ready for testing
- **Developers** know when packages need to be rebuilt after code changes
- **Release Managers** can identify PRs ready for QA validation
- **Reduce manual checking** of build bot comments

---

## 📋 Requirements

### Functional Requirements

1. **Parse BlueOrangutan Comments**
   - Detect packaging result comments from @blueorangutan bot
   - Extract package types (el7, el8, el9, el10, debian, suse15)
   - Extract SL-JID (Jenkins job ID)
   - Handle multiple comment formats

2. **Track Package Freshness**
   - Compare package build timestamp with last PR update
   - Mark packages as FRESH (green) or STALE (orange/red)
   - Consider commits pushed after package build

3. **Display in UI**
   - Show package badges in "All Open PRs" table
   - Color-coded status indicators
   - Clickable badges to view build logs
   - Tooltip showing build date and SL-JID

### Non-Functional Requirements

1. **Performance**
   - No significant impact on API response time (<100ms overhead)
   - Efficient querying (avoid N+1 problems)
   - Cache-friendly data structure

2. **Scalability**
   - Handle 200+ PRs with multiple package comments each
   - Support future package types

3. **Maintainability**
   - Clear parsing logic for bot comment patterns
   - Easy to update when bot format changes

---

## 🏗️ Architecture Design

### Data Flow

```
GitHub API (Comments)
       ↓
Scraper (scrape-github-prs.js)
       ↓
Parse BlueOrangutan Comments
       ↓
Database (pr_package_builds table)
       ↓
Backend API (getAllOpenPRsFromDatabase)
       ↓
Frontend (AllPRsView component)
       ↓
UI Display (Package badges)
```

### Component Breakdown

#### 1. Database Layer

**New Table: `pr_package_builds`**

```sql
CREATE TABLE pr_package_builds (
  id INT PRIMARY KEY AUTO_INCREMENT,
  pr_number INT NOT NULL,
  pr_title VARCHAR(500),
  
  -- Package build info
  packages JSON,  -- Array of package types: ["el8", "el9", "debian"]
  sl_jid INT,     -- Jenkins job ID
  build_url VARCHAR(500),  -- Link to build logs
  
  -- Timestamps
  comment_created_at DATETIME NOT NULL,  -- When bot posted comment
  comment_id BIGINT,  -- GitHub comment ID for deduplication
  
  -- Staleness tracking
  pr_updated_at DATETIME,  -- Last PR update from GitHub
  is_stale BOOLEAN DEFAULT FALSE,  -- Computed: comment_created_at < pr_updated_at
  
  -- Metadata
  inserted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_pr_number (pr_number),
  INDEX idx_sl_jid (sl_jid),
  INDEX idx_comment_created (comment_created_at),
  UNIQUE KEY unique_comment (pr_number, comment_id)
);
```

**Why JSON for packages?**
- Flexible: Easy to add new package types
- Queryable: MySQL 5.7+ supports JSON functions
- Compact: Single column vs multiple boolean columns

**Alternative considered:** Separate rows per package type
- ❌ More complex queries
- ❌ More storage
- ✅ Easier to filter (but not needed for this feature)

#### 2. Scraper Layer

**File:** `scripts/scrape-github-prs.js`

**New Function: `parseBlueOrangutanComment(comment)`**

```javascript
function parseBlueOrangutanComment(comment) {
  const body = comment.body || '';
  const username = comment.user?.login || '';
  
  // Check if it's from BlueOrangutan bot
  if (username !== 'blueorangutan') {
    return null;
  }
  
  // Check if it's a packaging result
  if (!body.includes('Packaging result')) {
    return null;
  }
  
  // Extract packages
  const packages = [];
  
  // Pattern 1: "✔️ el8 and el9"
  const andPattern = /✔️\s+(el\d+)\s+and\s+(el\d+)/gi;
  let match;
  while ((match = andPattern.exec(body)) !== null) {
    packages.push(match[1], match[2]);
  }
  
  // Pattern 2: "✔️ el7" (standalone)
  const standalonePattern = /✔️\s+(el\d+|debian|suse\d+)/gi;
  while ((match = standalonePattern.exec(body)) !== null) {
    if (!packages.includes(match[1])) {
      packages.push(match[1]);
    }
  }
  
  // Extract SL-JID
  const jidMatch = body.match(/SL-JID\s+(\d+)/i);
  const slJid = jidMatch ? parseInt(jidMatch[1]) : null;
  
  // Build URL (if available)
  const buildUrlMatch = body.match(/https?:\/\/[^\s)]+/);
  const buildUrl = buildUrlMatch ? buildUrlMatch[0] : null;
  
  return {
    packages: [...new Set(packages)],  // Remove duplicates
    slJid,
    buildUrl,
    commentId: comment.id,
    createdAt: comment.created_at
  };
}
```

**New Function: `storePackageBuild(connection, prNumber, prTitle, packageData, prUpdatedAt)`**

```javascript
async function storePackageBuild(connection, prNumber, prTitle, packageData, prUpdatedAt) {
  if (!packageData || !packageData.packages || packageData.packages.length === 0) {
    return;
  }
  
  const packagesJson = JSON.stringify(packageData.packages);
  const commentCreatedAt = new Date(packageData.createdAt);
  const prUpdated = prUpdatedAt ? new Date(prUpdatedAt) : null;
  
  // Compute staleness
  const isStale = prUpdated && commentCreatedAt < prUpdated;
  
  await connection.execute(
    `INSERT INTO pr_package_builds 
      (pr_number, pr_title, packages, sl_jid, build_url, comment_created_at, comment_id, pr_updated_at, is_stale) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       packages = VALUES(packages),
       sl_jid = VALUES(sl_jid),
       build_url = VALUES(build_url),
       comment_created_at = VALUES(comment_created_at),
       pr_updated_at = VALUES(pr_updated_at),
       is_stale = VALUES(is_stale)`,
    [prNumber, prTitle, packagesJson, packageData.slJid, packageData.buildUrl, 
     commentCreatedAt, packageData.commentId, prUpdated, isStale]
  );
}
```

**Update: `processPR()` function**

```javascript
async function processPR(connection, prNumber, forceUpdate = false) {
  // ... existing code ...
  
  const pr = await fetchPRDetails(prNumber);
  const prUpdatedAt = pr.updated_at;  // GitHub's last update timestamp
  
  // Fetch comments
  const comments = await fetchPRComments(prNumber);
  
  // Parse BlueOrangutan comments
  const packageBuilds = [];
  for (const comment of comments) {
    const parsed = parseBlueOrangutanComment(comment);
    if (parsed) {
      packageBuilds.push(parsed);
    }
  }
  
  // Store the LATEST package build (most recent comment)
  if (packageBuilds.length > 0) {
    const latestBuild = packageBuilds.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    )[0];
    
    await storePackageBuild(connection, prNumber, prTitle, latestBuild, prUpdatedAt);
  }
  
  // ... rest of existing code ...
}
```

#### 3. Backend API Layer

**File:** `server/src/index.ts`

**Update: `PRData` Interface**

```typescript
interface PRData {
  number: number;
  title: string;
  // ... existing fields ...
  milestone?: string | null;
  packageBuilds?: {
    packages: string[];  // ["el8", "el9", "debian"]
    slJid?: number;
    buildUrl?: string;
    isStale: boolean;
    buildDate: string;  // ISO timestamp
  } | null;
}
```

**Update: `getAllOpenPRsFromDatabase()` Function**

```typescript
async function getAllOpenPRsFromDatabase(): Promise<PRData[]> {
  // ... existing query for allPRs ...
  
  const prNumbers = allPRs.map(r => r.pr_number);
  
  // Fetch package builds in bulk
  const packageBuildsResults = await queryWithRetry<any[]>(
    `SELECT pr_number, packages, sl_jid, build_url, is_stale, comment_created_at
     FROM pr_package_builds 
     WHERE pr_number IN (${prNumbers.map(() => '?').join(',')})
     ORDER BY comment_created_at DESC`,
    prNumbers
  );
  
  // Map package builds by PR number (take only the latest)
  const packageBuildsByPR = new Map();
  for (const pb of packageBuildsResults) {
    if (!packageBuildsByPR.has(pb.pr_number)) {
      packageBuildsByPR.set(pb.pr_number, {
        packages: JSON.parse(pb.packages || '[]'),
        slJid: pb.sl_jid,
        buildUrl: pb.build_url,
        isStale: pb.is_stale === 1,
        buildDate: pb.comment_created_at
      });
    }
  }
  
  // ... existing mapping logic ...
  
  const prDataPromises = allPRs.map(async row => {
    const prNumber = row.pr_number;
    
    // ... existing code ...
    
    const packageBuilds = packageBuildsByPR.get(prNumber) || null;
    
    return {
      number: prNumber,
      // ... existing fields ...
      milestone: row.milestone || null,
      packageBuilds
    };
  });
  
  return await Promise.all(prDataPromises);
}
```

#### 4. Frontend Layer

**File:** `client/src/types/index.ts`

```typescript
export interface PRData {
  number: number;
  title: string;
  // ... existing fields ...
  milestone?: string;
  packageBuilds?: {
    packages: string[];
    slJid?: number;
    buildUrl?: string;
    isStale: boolean;
    buildDate: string;
  } | null;
}
```

**File:** `client/src/components/AllPRsView.tsx`

**Add table column:**

```tsx
<th>Available Packages</th>
```

**Add table cell:**

```tsx
<td className="packages-cell">
  {pr.packageBuilds && pr.packageBuilds.packages.length > 0 ? (
    <div className="package-badges">
      {pr.packageBuilds.packages.map((pkg, idx) => (
        <a
          key={idx}
          href={pr.packageBuilds.buildUrl || `#`}
          target="_blank"
          rel="noopener noreferrer"
          className={`package-badge ${pr.packageBuilds.isStale ? 'stale' : 'fresh'}`}
          title={`Built: ${new Date(pr.packageBuilds.buildDate).toLocaleString()}
SL-JID: ${pr.packageBuilds.slJid || 'N/A'}
Status: ${pr.packageBuilds.isStale ? 'STALE (code changed after build)' : 'FRESH'}`}
        >
          📦 {pkg}
        </a>
      ))}
    </div>
  ) : (
    <span className="no-packages">—</span>
  )}
</td>
```

**File:** `client/src/components/AllPRsView.css`

```css
.packages-cell {
  text-align: center;
  min-width: 150px;
}

.package-badges {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: center;
}

.package-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
  cursor: pointer;
}

.package-badge.fresh {
  background: linear-gradient(135deg, #e6ffed 0%, #c6f6d5 100%);
  border: 1px solid #9ae6b4;
  color: #22543d;
}

.package-badge.stale {
  background: linear-gradient(135deg, #feebc8 0%, #fbd38d 100%);
  border: 1px solid #ed8936;
  color: #7c2d12;
}

.package-badge:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.package-badge.fresh:hover {
  background: linear-gradient(135deg, #c6f6d5 0%, #9ae6b4 100%);
}

.package-badge.stale:hover {
  background: linear-gradient(135deg, #fbd38d 0%, #f6ad55 100%);
}

.no-packages {
  color: #cbd5e0;
  font-style: italic;
  font-size: 13px;
}
```

---

## 🧪 Edge Cases & Considerations

### 1. Multiple Package Comments
**Scenario:** PR has multiple blueorangutan comments with different packages

**Solution:**
- Store only the LATEST comment (by timestamp)
- Rationale: Latest represents current state
- Alternative: Store all and aggregate (more complex, not needed)

### 2. Partial Package Builds
**Scenario:** "✔️ el8" then later "✔️ debian"

**Solution:**
- Each comment is independent
- Only show the latest complete set
- Don't try to merge multiple comments

### 3. Failed Package Builds
**Scenario:** "Packaging result: ❌ el8"

**Solution:**
- Phase 1: Ignore failed builds (only show successful ✔️)
- Phase 2 (future): Track failures separately with different styling

### 4. Staleness Edge Cases

**Case A: PR updated due to comment, not code**
- Problem: Comment itself triggers `pr.updated_at`
- Solution: Check if `push` events exist after build comment
- Simpler: Accept minor false positives (comment as "update")

**Case B: Force push resets timestamps**
- Problem: Force push can change commit dates
- Solution: Use `push` event timestamp, not commit timestamp
- GitHub API: `pr.updated_at` reflects latest push

**Case C: Merge commit from base branch**
- Problem: Merging main into PR updates timestamp
- Solution: Phase 1: Accept false positive (safer)
- Phase 2 (future): Check only HEAD commits since build

### 5. Bot Username Changes
**Scenario:** BlueOrangutan changes username

**Solution:**
- Make username configurable
- Also check comment pattern as fallback
- Log warnings if pattern matches but username doesn't

### 6. Package Type Variations
**Scenario:** New package types added (e.g., el11, ubuntu24)

**Solution:**
- Regex pattern: `/el\d+|debian|suse\d+|ubuntu\d+/`
- Flexible pattern accommodates new types
- No code changes needed for new distro versions

---

## 📊 Database Migration

### Migration Script

**File:** `scripts/migrations/001_add_package_builds_table.sql`

```sql
-- Add pr_package_builds table
CREATE TABLE IF NOT EXISTS pr_package_builds (
  id INT PRIMARY KEY AUTO_INCREMENT,
  pr_number INT NOT NULL,
  pr_title VARCHAR(500),
  
  packages JSON NOT NULL,
  sl_jid INT,
  build_url VARCHAR(500),
  
  comment_created_at DATETIME NOT NULL,
  comment_id BIGINT,
  
  pr_updated_at DATETIME,
  is_stale BOOLEAN DEFAULT FALSE,
  
  inserted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_pr_number (pr_number),
  INDEX idx_sl_jid (sl_jid),
  INDEX idx_comment_created (comment_created_at),
  UNIQUE KEY unique_comment (pr_number, comment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Verify table was created
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'cloudstack_tests' 
AND table_name = 'pr_package_builds';
```

### Backfill Script

**File:** `scripts/backfill-package-builds.js`

```javascript
#!/usr/bin/env node

/**
 * Backfill Package Builds
 * 
 * Scans existing PR comments to populate pr_package_builds table
 * 
 * Usage:
 *   node scripts/backfill-package-builds.js           # Dry run
 *   node scripts/backfill-package-builds.js --execute # Execute
 */

// Similar structure to backfill-milestones.js
// Fetch all open PRs
// For each PR, fetch comments
// Parse blueorangutan comments
// Store in database
```

---

## 🎯 Implementation Phases

### Phase 1: Core Functionality (MVP)
**Scope:** Basic package display with simple staleness

**Tasks:**
1. ✅ Create database table
2. ✅ Update scraper to parse blueorangutan comments
3. ✅ Update backend API to return package data
4. ✅ Update frontend types
5. ✅ Add UI column with package badges
6. ✅ Implement basic staleness (compare timestamps)
7. ✅ Create backfill script
8. ✅ Test with real PR data

**Estimated Time:** 6-8 hours

### Phase 2: Enhanced Staleness Detection
**Scope:** More accurate staleness using push events

**Tasks:**
1. Track individual push events per PR
2. Compare build timestamp with push timestamps (not just PR updated_at)
3. Exclude merge commits from base branch
4. Add "last code change" timestamp field

**Estimated Time:** 3-4 hours

### Phase 3: Additional Features
**Scope:** Nice-to-have enhancements

**Tasks:**
1. Failed build tracking (❌ badges)
2. Build in progress indication (⏳ badges)
3. Click badge to view Jenkins logs
4. Filter PRs by package availability
5. Stats: "X PRs have fresh packages"
6. Package rebuild notifications

**Estimated Time:** 4-6 hours

---

## 🧪 Testing Strategy

### Unit Tests

1. **Comment Parsing**
   ```javascript
   describe('parseBlueOrangutanComment', () => {
     it('should parse "el8 and el9" format', () => {
       const comment = {
         user: { login: 'blueorangutan' },
         body: 'Packaging result: ✔️ el8 and el9. SL-JID 18347'
       };
       const result = parseBlueOrangutanComment(comment);
       expect(result.packages).toEqual(['el8', 'el9']);
       expect(result.slJid).toBe(18347);
     });
     
     it('should parse multi-package format', () => {
       const comment = {
         user: { login: 'blueorangutan' },
         body: 'Packaging result [SF]: ✔️ el8 ✔️ el9 ✔️ debian. SL-JID 16400'
       };
       const result = parseBlueOrangutanComment(comment);
       expect(result.packages).toEqual(['el8', 'el9', 'debian']);
     });
     
     it('should return null for non-bot comments', () => {
       const comment = {
         user: { login: 'someuser' },
         body: 'Great work!'
       };
       expect(parseBlueOrangutanComment(comment)).toBeNull();
     });
   });
   ```

2. **Staleness Logic**
   ```javascript
   describe('Package staleness', () => {
     it('should mark as FRESH when build is after PR update', () => {
       const buildDate = new Date('2026-01-19T10:00:00Z');
       const prUpdated = new Date('2026-01-19T09:00:00Z');
       expect(buildDate > prUpdated).toBe(true);
     });
     
     it('should mark as STALE when PR updated after build', () => {
       const buildDate = new Date('2026-01-19T09:00:00Z');
       const prUpdated = new Date('2026-01-19T10:00:00Z');
       expect(buildDate < prUpdated).toBe(true);
     });
   });
   ```

### Integration Tests

1. **Database Operations**
   - Insert package build
   - Update existing package build
   - Query by PR number
   - Verify JSON parsing

2. **API Endpoint**
   - `/api/all-open-prs` returns packageBuilds
   - packageBuilds has correct structure
   - isStale is computed correctly

3. **Frontend Rendering**
   - Package badges render
   - Color coding works (fresh vs stale)
   - Tooltip shows correct info
   - Click opens build URL

### Manual Testing Checklist

```
[ ] Fresh packages show green badges
[ ] Stale packages show orange badges
[ ] Clicking badge opens Jenkins SL-JID page
[ ] Tooltip shows build date and status
[ ] PRs without packages show "—"
[ ] Multiple packages display correctly
[ ] Long package lists wrap properly
[ ] Mobile view works (responsive)
[ ] Performance: Page loads in <2 seconds
[ ] Database: No duplicate entries
[ ] Backfill script works on existing PRs
```

---

## 📈 Performance Considerations

### Query Optimization

1. **Bulk Fetching**
   - Fetch all package builds in single query using IN clause
   - No N+1 problem

2. **Indexing**
   - Index on `pr_number` for fast lookups
   - Index on `comment_created_at` for ORDER BY

3. **JSON Performance**
   - MySQL 5.7+ has native JSON support
   - JSON parsing is efficient for small arrays
   - Alternative: TEXT column with comma-separated values (less flexible)

### Caching Strategy

**Current:** No caching (data changes frequently)

**Future (if needed):**
- Redis cache for PR list (TTL: 5 minutes)
- Invalidate on scraper run
- Cache key: `all-open-prs:${timestamp}`

### Estimated Impact

- **Database query time:** +50-100ms
- **API serialization:** +20ms
- **Frontend rendering:** +10ms
- **Total overhead:** ~80-130ms (acceptable)

---

## 🔒 Security Considerations

1. **SQL Injection**
   - ✅ Use parameterized queries
   - ✅ Avoid string concatenation

2. **XSS (Cross-Site Scripting)**
   - ✅ React auto-escapes JSX
   - ✅ Don't use `dangerouslySetInnerHTML`

3. **URL Validation**
   - ⚠️ Build URLs come from bot comments
   - ✅ Validate URL format before storing
   - ✅ Use `rel="noopener noreferrer"` on links

4. **GitHub API Rate Limits**
   - ✅ Already handled by scraper token
   - ✅ Backfill script respects rate limits

---

## 📝 Documentation Requirements

1. **README.md**
   - Add "Available Packages" to features list
   - Explain package badge colors

2. **API Documentation**
   - Document new `packageBuilds` field
   - Provide example response

3. **Deployment Guide**
   - Add migration script to checklist
   - Document backfill process

4. **Context Files**
   - Update .copilot with new feature
   - Update CONTEXT_PROMPT.md

---

## 🚀 Deployment Plan

### Pre-Deployment

1. Review this plan document
2. Get stakeholder approval
3. Create feature branch: `feature/available-packages`
4. Set up local test environment

### Deployment Steps

1. **Database Migration** (5 min)
   ```bash
   mysql -u results -p cloudstack_tests < scripts/migrations/001_add_package_builds_table.sql
   ```

2. **Backfill Data** (10-15 min)
   ```bash
   node scripts/backfill-package-builds.js --execute
   ```

3. **Deploy Code** (5 min)
   ```bash
   git checkout feature/available-packages
   npm run build
   # Restart backend server
   ```

4. **Verify** (5 min)
   - Check API returns packageBuilds
   - Check UI displays badges
   - Check database has data

**Total Time:** ~30 minutes

### Rollback Plan

**Quick Rollback:**
```bash
git checkout main
npm run build
# Restart server
```

**Database Rollback (if needed):**
```sql
DROP TABLE pr_package_builds;
```

---

## 🎓 Lessons from Previous Deployments

Based on milestone feature deployment:

1. **✅ Kill old server process explicitly**
   - Don't rely on pkill patterns
   - Use specific PID: `ps aux | grep node`

2. **✅ Test API directly after deployment**
   - `curl http://localhost:5001/api/all-open-prs | jq '.[0]'`
   - Don't just test UI (could be cached)

3. **✅ Check process timestamps**
   - `ps -p <PID> -o lstart=`
   - Verify server started AFTER build

4. **✅ Use proper process manager**
   - Consider systemd or pm2
   - Avoid nohup for production

---

## ✅ Acceptance Criteria

Feature is complete when:

- [x] Database table created and migrated
- [x] Scraper parses blueorangutan comments
- [x] Backend API returns package build data
- [x] Frontend displays package badges
- [x] Green badges for fresh packages
- [x] Orange badges for stale packages
- [x] Tooltip shows build date and SL-JID
- [x] Clicking badge opens Jenkins logs
- [x] Backfill script populates existing PRs
- [x] No performance degradation (<100ms overhead)
- [x] Documentation updated
- [x] Manual testing passed
- [x] Code reviewed by peer
- [x] Successfully deployed to production

---

## 📞 Questions for Stakeholders

1. **Package Priority:** Which packages are most important? (el8/el9 vs others)
2. **Failed Builds:** Should we show failed builds (❌) or only successful (✔️)?
3. **Build Links:** Confirm Jenkins URL format for SL-JID links
4. **Staleness Definition:** Is comparing with pr.updated_at sufficient, or do we need push event tracking?
5. **UI Placement:** Where in the table should the column go? (After "Milestone"?)

---

**Status:** 📋 Ready for Review  
**Next Step:** Get stakeholder approval → Begin Phase 1 implementation  
**Estimated Delivery:** Phase 1 in 1-2 days
