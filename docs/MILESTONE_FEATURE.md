# Milestone Feature Documentation

## Overview

The Milestone feature adds a new column to the "All Open PRs" page that displays which GitHub milestone (if any) each PR is associated with. This helps teams track which version/release a PR is targeting.

## Features

### Display
- **Milestone Column:** New sortable column between "Assignee" and "LGTMs"
- **Visual Badge:** Teal gradient badge with 🎯 icon
- **Tooltip:** Hover to see full milestone name
- **Null Handling:** Shows "—" for PRs without milestone

### Sorting
- Click "Milestone" column header to sort
- Ascending: Empty milestones first, then alphabetically (4.19.0, 4.20.0, 4.22.0)
- Descending: Alphabetically descending, then empty milestones last

### Data Source
- **Primary:** GitHub API `pr.milestone.title` field
- **Storage:** `pr_states.milestone` column (VARCHAR(100))
- **Updates:** Automatic via regular scraper runs

## Technical Implementation

### Database Schema

```sql
-- Added to pr_states table
ALTER TABLE pr_states ADD COLUMN milestone VARCHAR(100) DEFAULT NULL;
```

**Notes:**
- Nullable column (backwards compatible)
- VARCHAR(100) to accommodate milestone names like "4.20.0-RC1-hotfix"
- No index initially (can add if sorting performance is slow)

### Backend Changes

**File:** `server/src/index.ts`

```typescript
interface PRData {
  // ... existing fields
  milestone?: string | null;  // NEW
}
```

**SQL Query:** Added `milestone` to SELECT in `getAllOpenPRsFromDatabase()`

```sql
SELECT 
  pr_number,
  MAX(pr_title) as pr_title,
  MAX(pr_state) as pr_state,
  MAX(inserted_at) as inserted_at,
  MAX(assignees) as assignees,
  MAX(milestone) as milestone  -- NEW
FROM (...)
```

### Frontend Changes

**File:** `client/src/types/index.ts`
```typescript
export interface PRData {
  // ... existing fields
  milestone?: string;  // NEW
}
```

**File:** `client/src/components/AllPRsView.tsx`
- Added 'milestone' to `SortField` type
- Added milestone sorting logic
- Added milestone table header (sortable)
- Added milestone table cell with badge

**File:** `client/src/components/AllPRsView.css`
```css
.milestone-cell { /* Styling for table cell */ }
.milestone-badge { /* Teal gradient badge */ }
.no-milestone { /* Styling for empty state */ }
```

### Scraper Updates

**Files Modified:**
- `scripts/scrape-github-prs.js`
- `scripts/update-pr-states.js`

**Key Changes:**
```javascript
// Extract milestone from GitHub API
const milestone = pr.milestone?.title || null;

// Store in database
await connection.execute(
  `INSERT INTO pr_states (..., milestone, ...) 
   VALUES (..., ?, ...)
   ON DUPLICATE KEY UPDATE milestone = VALUES(milestone)`,
  [..., milestone, ...]
);
```

### Backfill Script

**File:** `scripts/backfill-milestones.js`

**Purpose:** One-time population of milestone data for existing PRs

**Usage:**
```bash
# Dry run (preview only)
node scripts/backfill-milestones.js

# Execute (actually update database)
node scripts/backfill-milestones.js --execute

# Force update even if milestone already set
node scripts/backfill-milestones.js --execute --force
```

**Features:**
- Checks GitHub API rate limit before starting
- Processes PRs in batches (default: 50)
- Validates milestone column exists
- Dry-run mode for safety
- Progress logging
- Summary statistics

## Deployment

See detailed guide: `MILESTONE_DEPLOYMENT_GUIDE.md`

**Quick Steps:**
1. Add milestone column to database
2. Run backfill script for existing PRs
3. Deploy code changes
4. Verify frontend displays correctly

## Rollback

See detailed plan: `MILESTONE_ROLLBACK_PLAN.md`

**Quick Rollback:**
```bash
git checkout main
npm run build
# Restart services
```

**Column Removal (only if necessary):**
```sql
ALTER TABLE pr_states DROP COLUMN milestone;
```

## Examples

### Example PR Data (API Response)

```json
{
  "number": 12431,
  "title": "Fix memory leak in storage pool",
  "url": "https://github.com/apache/cloudstack/pull/12431",
  "milestone": "4.20.3",  // NEW
  "assignees": ["user1", "user2"],
  "approvals": { "approved": 2, "changesRequested": 0 },
  "smokeTests": [...]
}
```

### Example UI Display

```
| Status | PR #  | Title              | Assignee | Milestone  | LGTMs | ... |
|--------|-------|--------------------|---------|-----------  |-------|-----|
| ✅     | 12431 | Fix memory leak    | @user1  | 🎯 4.20.3  | 👍 2  | ... |
| ⚠️     | 12430 | Add feature X      | @user2  | —          | 👍 1  | ... |
| ✅     | 12428 | Upgrade library    | —       | 🎯 4.22.0  | 👍 3  | ... |
```

## Testing

### Test Cases

1. **Display:**
   - ✅ PRs with milestone show badge
   - ✅ PRs without milestone show "—"
   - ✅ Long milestone names truncate properly
   - ✅ Tooltip shows full milestone name

2. **Sorting:**
   - ✅ Sort ascending (empty first, then alphabetical)
   - ✅ Sort descending (alphabetical, then empty)
   - ✅ Mixed null/non-null values sort correctly

3. **Performance:**
   - ✅ Query time < 500ms with 200+ PRs
   - ✅ No N+1 query issues
   - ✅ Page load time not significantly impacted

4. **Edge Cases:**
   - ✅ Very long milestone name (100+ chars)
   - ✅ Special characters (4.20.0-RC1)
   - ✅ Milestone removed after initial sync
   - ✅ NULL vs empty string handling

5. **Scraper:**
   - ✅ Extracts milestone correctly
   - ✅ Handles missing milestone gracefully
   - ✅ Updates existing milestone
   - ✅ API error handling

### Manual Testing Checklist

```
[ ] Open "All Open PRs" page
[ ] Verify milestone column appears after "Assignee"
[ ] Click "Milestone" header - table sorts
[ ] Click again - sort direction reverses
[ ] Hover milestone badge - tooltip appears
[ ] Check PRs with milestone show badge
[ ] Check PRs without milestone show "—"
[ ] Open browser console - no errors
[ ] Check mobile/responsive view (if applicable)
[ ] Refresh page - milestone data persists
```

## Monitoring

### Key Metrics

1. **Query Performance:**
```sql
-- Check query execution time
EXPLAIN SELECT ... FROM pr_states WHERE pr_state = 'open';
```

2. **Data Quality:**
```sql
-- Check milestone distribution
SELECT milestone, COUNT(*) 
FROM pr_states 
WHERE pr_state = 'open' 
GROUP BY milestone;
```

3. **Scraper Success:**
```bash
# Check scraper logs
grep "milestone" /path/to/scraper.log
```

### Health Checks

**Daily:**
- Check for server errors related to milestone
- Verify scraper runs successfully
- Monitor query performance

**Weekly:**
- Audit milestone data accuracy
- Check for PRs with outdated milestones
- Review user feedback

## Future Enhancements

Potential improvements:

1. **Milestone Filter:** Add stat box to filter by specific milestone
2. **Milestone Stats:** Show count per milestone
3. **Color Coding:** Different colors for different milestone versions
4. **Historical Tracking:** Track milestone changes over time
5. **Index:** Add index if sorting performance becomes issue

## FAQs

**Q: Why do some PRs show "—" for milestone?**  
A: These PRs don't have a milestone set in GitHub. This is normal and expected.

**Q: How often is milestone data updated?**  
A: Milestone data is updated automatically when the scraper runs (typically every few hours via cron).

**Q: Can I manually trigger a milestone update?**  
A: Yes, run the scraper for specific PRs: `node scripts/scrape-github-prs.js --pr-number=12345`

**Q: What if milestone data is wrong?**  
A: Check GitHub first. If GitHub is correct but portal is wrong, wait for next scraper run or manually trigger update.

**Q: Does this affect performance?**  
A: Minimal impact. The milestone field is fetched with other PR data in a single query.

**Q: What happens if I remove the milestone from GitHub?**  
A: Next scraper run will update the database to NULL, and the portal will show "—".

## References

- GitHub API: https://docs.github.com/en/rest/pulls/pulls
- Milestone object: `pr.milestone.title`
- Deployment guide: `MILESTONE_DEPLOYMENT_GUIDE.md`
- Rollback plan: `MILESTONE_ROLLBACK_PLAN.md`

---

**Last Updated:** 2026-01-15  
**Version:** 1.0  
**Status:** ✅ Production Ready
