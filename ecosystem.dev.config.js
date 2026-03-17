module.exports = {
  apps: [
    {
      name: 'handyseller-api-dev',
      cwd: '/home/ubuntu/handyseller-repo/apps/api',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development',
        PORT: 4001,
        DATABASE_URL: process.env.DATABASE_URL || 'postgresql://handyseller:handyseller@localhost:5432/handyseller',
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
      },
      watch: false,
      autorestart: true,
    },
    {
      name: 'handyseller-web-dev',
      cwd: '/home/ubuntu/handyseller-repo/apps/web',
      script: 'npm',
      args: 'run dev -- -p 3002',
      env: {
        NODE_ENV: 'development',
        PORT: 3002,
        NEXT_PUBLIC_API_URL: 'https://dev.handyseller.ru/api',
      },
      watch: false,
      autorestart: true,
    },
  ],
};
