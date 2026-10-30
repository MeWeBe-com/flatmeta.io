// MapLibre v6 runs its tile worker from a separate ES module; serve it from /vendor.
// Resolves the package wherever npm hoisted it (workspace root or this app).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve('maplibre-gl/package.json'));
mkdirSync('public/vendor', { recursive: true });
copyFileSync(join(pkgDir, 'dist/maplibre-gl-worker.mjs'), 'public/vendor/maplibre-gl-worker.mjs');
console.log('Copied maplibre-gl-worker.mjs → public/vendor/');
