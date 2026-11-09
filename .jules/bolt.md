# Bolt's Journal

## 2026-11-09 - Math.min/max spread syntax stack limits in spatial algorithms
**Learning:** Using `Math.min(...points.map(p => p.gx))` performs multiple allocations and crashes with `Maximum call stack size exceeded` in V8 when point sets exceed ~65,536 elements. A single-pass loop avoids all allocations and prevents stack overflow while running ~8.5x faster.
**Action:** When calculating extents or aggregations in grid/spatial calculations, always use single-pass iterative loops instead of spreading array map results.
