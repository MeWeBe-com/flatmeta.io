# Bolt's Journal

Critical performance learnings and codebase-specific patterns.

## 2026-11-07 - In-memory Land Search Quadratic Deduplication
**Learning:** `LandService.search()` performs in-memory searching over all loaded areas and user owned areas on every keystroke (`onSearchInput`). Using `all.findIndex((b) => b.order_id === a.order_id) === i` inside `.filter(...)` creates an $O(N^2)$ bottleneck that also re-executes `slugify(q)` regex passes on every item.
**Action:** Use an $O(1)$ `Set<string>` to deduplicate items linearly and break immediately upon reaching the 8-item query result display threshold. Pre-compute queries like `slugify(q)` outside candidate loops.
