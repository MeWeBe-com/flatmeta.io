// PM2 apps: web (Next.js), API, worker. APP_ENV=staging gives "-staging" names so two
// environments can live side by side under one user. Everything is read from the repo-root .env.
//   pm2 startOrReload ecosystem.config.cjs --update-env
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

const root = __dirname;
const envFile = path.join(root, '.env');
const fileEnv = fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {};
const env = { ...fileEnv, ...process.env };
const appEnv = env.APP_ENV || 'production';
const suffix = appEnv === 'production' ? '' : `-${appEnv}`;
// Values already in the shell (e.g. `APP_URL=… pm2 start`) win over the file, like dotenv; unrelated shell variables are left alone.
const overrides = Object.fromEntries(Object.entries(process.env).filter(([k]) => k in fileEnv));
const base = { ...fileEnv, ...overrides, NODE_ENV: 'production', APP_ENV: appEnv };

module.exports = {
  apps: [
    {
      name: `flatmeta-web${suffix}`,
      cwd: path.join(root, 'apps/web'),
      script: path.join(root, 'node_modules/next/dist/bin/next'), // hoisted by npm workspaces
      args: `start -p ${env.WEB_PORT || 3200}`,
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: 8000,
      max_memory_restart: '700M',
      env: base,
    },
    {
      name: `flatmeta-api${suffix}`,
      cwd: path.join(root, 'apps/api'),
      script: 'dist/src/server.js',
      exec_mode: 'fork',
      instances: 1,
      wait_ready: true,
      listen_timeout: 20000,
      kill_timeout: 8000,
      max_memory_restart: '700M',
      env: base,
    },
    {
      name: `flatmeta-worker${suffix}`,
      cwd: path.join(root, 'apps/api'),
      script: 'dist/src/worker.js',
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: 15000,
      max_memory_restart: '500M',
      env: base,
    },
  ],
};
