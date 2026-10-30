import 'server-only';

/** Where server-side code (rendering, rewrites, share images) reaches the API. Never sent to the browser. */
export const API_INTERNAL_URL = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:3201').replace(/\/$/, '');
