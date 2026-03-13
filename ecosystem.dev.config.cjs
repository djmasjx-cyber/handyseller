/**
 * PM2 ecosystem для dev-окружения.
 * Prod — Docker (4000/3001). Dev — PM2 (4001/3002).
 * Запуск: npm run dev:parallel
 * Остановка: npm run dev:parallel:stop
 */
const path = require('path');
const ROOT = path.resolve(__dirname);

module.exports = {
  apps: [
    {
      name: 'handyseller-dev-api',
      script: path.join(ROOT, 'scripts/run-with-node20.sh'),
      args: ['npm', 'run', 'dev:api'],
      cwd: ROOT,
      env: {
        PORT: '4001',
        NODE_ENV: 'development',
        REDIS_HOST: '127.0.0.1',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 15,
      min_uptime: '5s',
      restart_delay: 2000,
      error_file: '/tmp/handyseller-dev-api.log',
      out_file: '/tmp/handyseller-dev-api.log',
      merge_logs: true,
      kill_timeout: 5000,
    },
    {
      name: 'handyseller-dev-web',
      script: path.join(ROOT, 'scripts/run-with-node20.sh'),
      args: ['npm', 'run', 'dev', '--workspace=web'],
      cwd: ROOT,
      env: {
        PORT: '3002',
        NEXT_PUBLIC_API_URL: 'http://localhost:4001',
        NODE_ENV: 'development',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 15,
      min_uptime: '5s',
      restart_delay: 2000,
      error_file: '/tmp/handyseller-dev-web.log',
      out_file: '/tmp/handyseller-dev-web.log',
      merge_logs: true,
      kill_timeout: 5000,
    },
  ],
};
