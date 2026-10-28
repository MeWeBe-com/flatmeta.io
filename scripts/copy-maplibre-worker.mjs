// MapLibre v6 runs its tile worker from a separate ES module; serve it from /vendor.
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('public/vendor', { recursive: true });
copyFileSync('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', 'public/vendor/maplibre-gl-worker.mjs');
console.log('Copied maplibre-gl-worker.mjs → public/vendor/');
