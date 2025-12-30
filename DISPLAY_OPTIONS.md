# Flaky Test Display Options

## Current Data
- **9 test files**
- **12 flaky tests**
- Multiple platforms per test (KVM-ol8, XCPNG82, etc.)

---

## 🏆 OPTION 3: Grouped Rows (RECOMMENDED)

All tests visible at once with clear visual grouping by file.

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 📁 test_kubernetes_clusters.py                                        ┃
┃    3 tests • 28 failures • Last failure: Today                        ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                                                        ┃
┃  • test_03_deploy_and_scale_kubernetes_cluster                        ┃
┃    Platforms: [KVM-ol8] [XCPNG82]  •  12 failures  •  Today          ┃
┃    PRs: #12198, #12306                                                ┃
┃                                                                        ┃
┃  • test_08_upgrade_kubernetes_ha_cluster                              ┃
┃    Platforms: [XCPNG82]  •  8 failures  •  4 days ago                ┃
┃    PRs: #12198                                                        ┃
┃                                                                        ┃
┃  • test_12_test_deploy_cluster_different_offerings_per_node_type      ┃
┃    Platforms: [XCPNG82]  •  8 failures  •  4 days ago                ┃
┃    PRs: #12198                                                        ┃
┃                                                                        ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ 📁 test_list_domains.py                                               ┃
┃    2 tests • 16 failures • Last failure: 4 days ago                   ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                                                        ┃
┃  • test_04_list_domains_level_filter                                  ┃
┃    Platforms: [XCPNG82]  •  8 failures  •  4 days ago                ┃
┃    PRs: #12198                                                        ┃
┃                                                                        ┃
┃  • test_05_list_domains_no_filter                                     ┃
┃    Platforms: [XCPNG82]  •  8 failures  •  4 days ago                ┃
┃    PRs: #12198                                                        ┃
┃                                                                        ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

**Pros:**
- ✅ All 12 tests visible without clicking
- ✅ Clear file grouping with headers
- ✅ Clean, scannable layout
- ✅ Platform badges are clickable links

**Cons:**
- ❌ Takes more vertical space

---

## OPTION 1: Hierarchical Accordion (Current Implementation)

Tests hidden until you expand the file.

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  ▶ test_ssl_offloading.py                                             ┃
┃     1 test, 8 failures  │  Last failure: 4 days ago                   ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  ▼ test_kubernetes_clusters.py                                        ┃
┃     3 tests, 28 failures  │  Last failure: Today                      ┃
┃                                                                        ┃
┃     ┌────────────────────────────────────────────────────────────┐   ┃
┃     │ Test Name               │ Platforms      │ Failures │ Last │   ┃
┃     ├────────────────────────────────────────────────────────────┤   ┃
┃     │ test_03_deploy_and...  │ KVM-ol8        │    12    │Today │   ┃
┃     │                         │ XCPNG82        │          │      │   ┃
┃     ├────────────────────────────────────────────────────────────┤   ┃
┃     │ test_08_upgrade_kub... │ XCPNG82        │     8    │ 4d   │   ┃
┃     ├────────────────────────────────────────────────────────────┤   ┃
┃     │ test_12_test_deploy... │ XCPNG82        │     8    │ 4d   │   ┃
┃     └────────────────────────────────────────────────────────────┘   ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  ▶ test_list_domains.py                                               ┃
┃     2 tests, 16 failures  │  Last failure: 4 days ago                 ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

**Pros:**
- ✅ Compact view (less scrolling)
- ✅ Good for 100+ tests
- ✅ Shows file-level summary

**Cons:**
- ❌ Requires clicking to see tests
- ❌ Can't see all tests at once
- ❌ Extra friction with only 12 tests

---

## OPTION 2: Flat Table

Simple table with file column - all visible at once.

```
┏━━━━━━━━━━━━━━━━━━━━━┯━━━━━━━━━━━━━━━━━━━━━━━━━━━┯━━━━━━━━━━━━━┯━━━━━━━━━┓
┃ Test File            │ Test Name                 │ Platforms   │ Failures┃
┣━━━━━━━━━━━━━━━━━━━━━┿━━━━━━━━━━━━━━━━━━━━━━━━━━━┿━━━━━━━━━━━━━┿━━━━━━━━━┫
┃ test_kubernetes_     │ test_03_deploy_and...     │ KVM XCPNG   │   12    ┃
┃ test_kubernetes_     │ test_08_upgrade_kube...   │ XCPNG       │    8    ┃
┃ test_kubernetes_     │ test_12_test_deploy...    │ XCPNG       │    8    ┃
┃ test_list_domains    │ test_04_list_domains...   │ XCPNG       │    8    ┃
┃ test_list_domains    │ test_05_list_domains...   │ XCPNG       │    8    ┃
┃ test_ssl_offloading  │ test_01_ssl_offloading... │ XCPNG       │    8    ┃
┃ test_secondary_stor  │ test_01_sys_vm_start      │ XCPNG       │    8    ┃
┃ test_vm_strict_host  │ test_05_deploy_vm_on...   │ XCPNG       │    8    ┃
┃ test_usage           │ test_01_volume_usage      │ XCPNG       │    7    ┃
┃ test_diagnostics     │ test_07_arping_in_vr      │ XCPNG       │    7    ┃
┃ tests.smoke.test_k   │ test_03_deploy_and...     │ KVM         │    5    ┃
┃ tests.smoke.test_m   │ test_list_system_vms...   │ KVM         │    2    ┃
┗━━━━━━━━━━━━━━━━━━━━━┷━━━━━━━━━━━━━━━━━━━━━━━━━━━┷━━━━━━━━━━━━━┷━━━━━━━━━┛
```

**Pros:**
- ✅ All tests visible
- ✅ Sortable columns
- ✅ Simple and familiar

**Cons:**
- ❌ File names repeated
- ❌ Visual clutter
- ❌ Hard to see file grouping

---

## OPTION 5: Accordion with Rich Stats

Shows platform breakdown in collapsed state.

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  ▼ test_kubernetes_clusters.py                                        ┃
┃     ├─ 3 tests │ 28 failures │ Last: Today                            ┃
┃     └─ Platforms: KVM-ol8 (4 fails), XCPNG82 (24 fails)               ┃
┃                                                                        ┃
┃     ├─ test_03_deploy_and_scale_kubernetes_cluster                    ┃
┃     │  ├─ [KVM-ol8: 4 failures, 1 success] 📋 View logs               ┃
┃     │  └─ [XCPNG82: 8 failures, 0 success] 📋 View logs               ┃
┃     │                                                                  ┃
┃     ├─ test_08_upgrade_kubernetes_ha_cluster                          ┃
┃     │  └─ [XCPNG82: 8 failures, 0 success] 📋 View logs               ┃
┃     │                                                                  ┃
┃     └─ test_12_test_deploy_cluster_different_offerings...             ┃
┃        └─ [XCPNG82: 8 failures, 0 success] 📋 View logs               ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  ▶ test_list_domains.py                                               ┃
┃     ├─ 2 tests │ 16 failures │ Last: 4 days ago                       ┃
┃     └─ Platforms: XCPNG82 (16 fails)                                  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

**Pros:**
- ✅ Rich information in collapsed view
- ✅ Shows platform aggregation
- ✅ Best for large datasets

**Cons:**
- ❌ Still requires clicking to see tests
- ❌ More complex

---

## 📊 Comparison Summary

| Feature              | Option 1 (Now) | Option 2 | Option 3 🏆 | Option 5 |
|---------------------|----------------|----------|-------------|----------|
| All tests visible   | ❌ (expand)     | ✅       | ✅          | ❌       |
| File grouping clear | ✅             | ❌       | ✅          | ✅       |
| No clicking needed  | ❌             | ✅       | ✅          | ❌       |
| Scales to 100+ tests| ✅             | ❌       | ⚠️          | ✅       |
| Clean layout        | ✅             | ⚠️       | ✅          | ✅       |
| Rich metadata       | ⚠️             | ❌       | ⚠️          | ✅       |

---

## 💡 My Recommendation

**For your data (12 tests, 9 files):**

### 🥇 Option 3: Grouped Rows
**Best overall** - All tests visible, clear grouping, clean layout

### 🥈 Option 5: Accordion with Stats  
**If you expect to grow** to 50+ tests, this scales better

### 🥉 Option 2: Flat Table
**Simplest option** - if you don't care about file grouping

---

## Next Steps

Tell me which option you prefer and I'll implement it!

Options:
1. **Option 3** - Grouped Rows (my recommendation)
2. **Option 5** - Rich Accordion  
3. **Option 2** - Simple Table
4. **Keep current** (Option 1)
5. **Show me another option** from the full list

