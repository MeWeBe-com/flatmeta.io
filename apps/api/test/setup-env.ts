// Runs before every test file: point the app at the test database and a separate Redis DB.
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = process.env.REDIS_URL_TEST ?? 'redis://localhost:6379/15';
process.env.REDIS_PREFIX = 'fmtest';
process.env.MEDIA_DIR = './storage/test-media';
process.env.PAYMENTS_MOCK = 'true';
process.env.AI_TEXT_PROVIDER = 'heuristic';
process.env.AI_MODERATION_PROVIDER = 'heuristic';
process.env.AI_IMAGE_PROVIDER = 'procedural';
process.env.SESSION_SECRET = 'test-secret';
