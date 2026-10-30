/**
 * Where to start the map without asking for location permission: the browser's
 * time zone usually names a nearby city. Falls back to the continent.
 */
const TZ: Record<string, [number, number, number]> = {
  'Europe/London': [-0.12, 51.5, 10], 'Europe/Dublin': [-6.26, 53.35, 10], 'Europe/Paris': [2.35, 48.86, 10], 'Europe/Berlin': [13.4, 52.52, 10],
  'Europe/Madrid': [-3.7, 40.42, 10], 'Europe/Rome': [12.5, 41.9, 10], 'Europe/Amsterdam': [4.9, 52.37, 10], 'Europe/Brussels': [4.35, 50.85, 10],
  'Europe/Lisbon': [-9.14, 38.72, 10], 'Europe/Stockholm': [18.07, 59.33, 10], 'Europe/Oslo': [10.75, 59.91, 10], 'Europe/Copenhagen': [12.57, 55.68, 10],
  'Europe/Helsinki': [24.94, 60.17, 10], 'Europe/Vienna': [16.37, 48.21, 10], 'Europe/Zurich': [8.54, 47.38, 10], 'Europe/Prague': [14.44, 50.08, 10],
  'Europe/Warsaw': [21.01, 52.23, 10], 'Europe/Athens': [23.73, 37.98, 10], 'Europe/Istanbul': [28.98, 41.01, 10], 'Europe/Budapest': [19.04, 47.5, 10],
  'Europe/Kyiv': [30.52, 50.45, 10], 'Europe/Moscow': [37.62, 55.75, 9],
  'America/New_York': [-73.99, 40.75, 10], 'America/Chicago': [-87.63, 41.88, 10], 'America/Denver': [-104.99, 39.74, 10], 'America/Los_Angeles': [-118.24, 34.05, 10],
  'America/Phoenix': [-112.07, 33.45, 10], 'America/Toronto': [-79.38, 43.65, 10], 'America/Vancouver': [-123.12, 49.28, 10], 'America/Mexico_City': [-99.13, 19.43, 10],
  'America/Sao_Paulo': [-46.63, -23.55, 10], 'America/Argentina/Buenos_Aires': [-58.38, -34.6, 10], 'America/Bogota': [-74.07, 4.71, 10], 'America/Lima': [-77.04, -12.05, 10],
  'America/Santiago': [-70.67, -33.45, 10], 'Asia/Tokyo': [139.77, 35.68, 10], 'Asia/Seoul': [126.98, 37.57, 10], 'Asia/Shanghai': [121.47, 31.23, 10],
  'Asia/Hong_Kong': [114.16, 22.28, 11], 'Asia/Singapore': [103.85, 1.29, 11], 'Asia/Kolkata': [72.88, 19.08, 9], 'Asia/Calcutta': [72.88, 19.08, 9],
  'Asia/Dubai': [55.27, 25.2, 10], 'Asia/Bangkok': [100.5, 13.76, 10], 'Asia/Jakarta': [106.85, -6.21, 10], 'Asia/Manila': [120.98, 14.6, 10],
  'Asia/Karachi': [67.0, 24.86, 10], 'Asia/Dhaka': [90.41, 23.81, 10], 'Asia/Riyadh': [46.68, 24.71, 10], 'Asia/Jerusalem': [34.78, 32.09, 10],
  'Asia/Taipei': [121.57, 25.03, 10], 'Asia/Kuala_Lumpur': [101.69, 3.14, 10], 'Asia/Ho_Chi_Minh': [106.63, 10.82, 10],
  'Africa/Lagos': [3.38, 6.52, 10], 'Africa/Cairo': [31.24, 30.04, 10], 'Africa/Nairobi': [36.82, -1.29, 10], 'Africa/Johannesburg': [28.05, -26.2, 10],
  'Africa/Casablanca': [-7.59, 33.57, 10], 'Africa/Accra': [-0.19, 5.6, 10], 'Australia/Sydney': [151.21, -33.87, 10], 'Australia/Melbourne': [144.96, -37.81, 10],
  'Australia/Brisbane': [153.03, -27.47, 10], 'Australia/Perth': [115.86, -31.95, 10], 'Pacific/Auckland': [174.76, -36.85, 10],
};
const CONTINENT: Record<string, [number, number, number]> = {
  Europe: [10, 50, 3.5], America: [-90, 25, 2.5], Asia: [95, 30, 2.5], Africa: [20, 5, 2.8], Australia: [134, -26, 3.2], Pacific: [170, -20, 2.5], Atlantic: [-30, 30, 2.5], Indian: [75, -10, 2.5],
};

export function guessStart(): { lng: number; lat: number; zoom: number } | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hit = TZ[tz] ?? CONTINENT[tz.split('/')[0] ?? ''];
    return hit ? { lng: hit[0], lat: hit[1], zoom: hit[2] } : null;
  } catch {
    return null;
  }
}
