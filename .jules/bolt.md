## 2026-11-03 - Memoize grouped land areas in LandService

**Learning:** `LandService.areas()` grouped up to 15,000 tiles into `LandArea` objects on every call, and `area(orderId)` performed an unmemoized linear search over this newly computed array. Because map clicks, editor openings, and searches query `area(orderId)` repeatedly, this created unnecessary CPU overhead and allocation churn on frequent interactions.
**Action:** Memoize `cachedAreas` and index `areasByOrderId` in `LandService`, invalidating whenever `publish()` updates the underlying tile collections.
