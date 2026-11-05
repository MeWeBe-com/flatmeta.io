## 2026-11-05 - LandService Area Grouping and Search Deduplication
**Learning:** `LandService.areas()` was invoked on nearly every area query and search input without caching, iterating over up to 15,000 tiles each time, while `search()` executed an O(N²) quadratic `findIndex` check on every keystroke.
**Action:** In `LandService`, group and cache `LandArea` instances when `tiles$` publishes rather than on-demand, and use a `Set` lookup with early termination in `search()`.
