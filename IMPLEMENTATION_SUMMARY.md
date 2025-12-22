# Test Failure Analysis - Implementation Summary

## ✅ COMPLETED (Dec 22, 2025)

### 1. Database Schema ✅
- Created `test_failures` table
- Fields: pr_number, test_name, test_file, result, time_seconds, hypervisor, hypervisor_version, test_date, logs_url
- Indexed for optimal query performance

### 2. Data Collection ✅
- Created `parse-test-failures.js` script
- Parses Trillian markdown test result tables
- **Initial Parse Results:**
  - 1,038 test failures extracted
  - 77 PRs with failures
  - 340 unique failing tests
  - 6 hypervisors tested (KVM, VMware, XCP-ng, etc.)

### 3. Scraper Integration ✅
- Updated `scrape-github-prs.js` to automatically parse test failures
- Added `parseTestFailures()` function
- Added `storeTestFailures()` function
- New PRs will automatically have failures analyzed

### 4. Backend API Endpoints ✅
- **GET /api/prs/:prNumber/test-failures**
  - Returns failures for specific PR
  - Classifies each as common (amber) or unique (red)
  - Includes occurrence count across other PRs
  
- **GET /api/test-failures/summary**
  - Statistics (total failures, unique tests, PRs affected, avg)
  - Most common failures (flaky tests - seen in 3+ PRs)
  - Recent failures (last 7 days) with classification
  - Failures by hypervisor platform
  
- **GET /api/test-failures/test/:testName**
  - Full history of a specific test
  - All PRs where it failed
  - Statistics and metadata

### 5. Frontend Components ✅
- **TestFailuresSummary.tsx** - New page component
  - Statistics dashboard (4 metric cards)
  - Most Common Failures table (flaky tests)
  - Recent Failures table (last 7 days)
  - Failures by Platform grid
  - Color-coded badges (amber=common, red=unique)
  
- **TestFailuresSummary.css** - Styling
  - Responsive grid layouts
  - Color-coded badges and indicators
  - Professional table styling
  - Mobile-friendly design

### 6. Navigation ✅
- Added "🧪 Test Failures" tab to main navigation
- Tab switches to TestFailuresSummary component
- Integrated into existing App.tsx tab system

### 7. Build & Deploy ✅
- Client built successfully (84.4 kB gzipped)
- Server compiled successfully
- No errors, only minor ESLint warnings (pre-existing)

## 📊 KEY INSIGHTS DISCOVERED

### Most Common Flaky Tests (Need Attention):
1. **test_03_deploy_and_scale_kubernetes_cluster** - 25 PRs (KVM, VMware, XCP-ng)
2. **test_01_vpn_usage** - 14 PRs (KVM, VMware, XCP-ng)
3. **test_01_migrate_vm_strict_tags_success** - 13 PRs (KVM, VMware, XCP-ng)
4. **test_01_events_resource** - 13 PRs (KVM, VMware, XCP-ng)
5. **test_01_non_strict_host_anti_affinity** - 13 PRs (KVM, XCP-ng)

These are infrastructure/test issues, NOT PR-specific bugs!

## 🎯 CLASSIFICATION LOGIC

**Common (Amber Badge):**
- Failure seen in 2+ other PRs
- Indicates flaky test or infrastructure issue
- Low severity - NOT caused by this PR's changes

**Unique (Red Badge):**
- First occurrence OR seen in <2 PRs
- Indicates potential regression from PR changes  
- High severity - Needs investigation

## 🚀 HOW TO USE

### For Developers:
1. Navigate to "🧪 Test Failures" tab
2. See dashboard of all test failures
3. **Amber badges** = ignore (flaky tests, not your fault)
4. **Red badges** = investigate (potential regression from your changes)

### For QA/Maintainers:
1. Check "Most Common Failures" section
2. Identify flaky tests needing fixes
3. Monitor "Recent Failures" for trends
4. Track by hypervisor to identify platform-specific issues

## 📁 FILES MODIFIED/CREATED

### Scripts:
- ✅ `scripts/parse-test-failures.js` (NEW)
- ✅ `scripts/scrape-github-prs.js` (MODIFIED - added failure parsing)

### Server:
- ✅ `server/src/index.ts` (MODIFIED - added 3 API endpoints)

### Client:
- ✅ `client/src/App.tsx` (MODIFIED - added test failures tab)
- ✅ `client/src/components/TestFailuresSummary.tsx` (NEW)
- ✅ `client/src/components/TestFailuresSummary.css` (NEW)

### Database:
- ✅ `test_failures` table created with indexes

## 🔄 NEXT STEPS (Future Enhancements)

### Phase 2 (Optional):
1. **Add to AllPRsView.tsx**
   - Show color-coded failures inline with smoke test results
   - Expand test result to show which specific tests failed
   - Amber for common, red for unique

2. **Test Detail Page**
   - Click on test name to see full history
   - Graph of failure frequency over time
   - Recommend actions (fix flaky test vs investigate)

3. **Automated Alerts**
   - GitHub PR comment when unique failures detected
   - Weekly report of most flaky tests
   - Email notifications for critical regressions

4. **ML/Analytics**
   - Predict failure likelihood
   - Identify patterns in test failures
   - Recommend test improvements

## 💡 USAGE TIPS

1. **Before Merging PR:**
   - Check test failures tab
   - If all failures are amber (common), safe to merge
   - If any red (unique), investigate first

2. **Test Maintenance:**
   - Review "Most Common Failures" weekly
   - Create issues for top 5 flaky tests
   - Track reduction in flaky tests over time

3. **Hypervisor Issues:**
   - Check "Failures by Platform" section
   - If one hypervisor has significantly more failures, investigate infrastructure

## 📈 EXPECTED IMPACT

- ✅ Faster PR reviews (distinguish real bugs from flaky tests)
- ✅ Improved test quality (identify and fix flaky tests)
- ✅ Better developer experience (don't blame developers for infra issues)
- ✅ Data-driven decisions (which tests need attention)

---

**Status:** ✅ READY FOR TESTING
**Build:** ✅ SUCCESS
**Date:** December 22, 2025
