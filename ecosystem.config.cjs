module.exports = {
  apps: [
    {
      name: 'recon-server',
      script: 'node',
      args: 'sse-server.mjs',
      cwd: '/root/octo-workspace/recon',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: '/var/log/pm2/recon-error.log',
      out_file: '/var/log/pm2/recon-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
