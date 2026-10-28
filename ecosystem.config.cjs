// PM2 app for the web. APP_ENV=staging gives "flatmeta-web-staging".
const env = process.env.APP_ENV || 'production';
const suffix = env === 'production' ? '' : `-${env}`;

module.exports = {
  apps: [
    {
      name: `flatmeta-web${suffix}`,
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      node_args: '--env-file-if-exists=.env',
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: 8000,
      max_memory_restart: '700M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
