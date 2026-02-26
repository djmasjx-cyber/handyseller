#!/usr/bin/env node
/**
 * Static export: temporarily excludes app/api (incompatible with output: export),
 * builds, then restores. Deployed frontend calls API via NEXT_PUBLIC_API_URL.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const webDir = path.join(__dirname, '../apps/web');
const apiDir = path.join(webDir, 'app/api');
const apiBackup = path.join(__dirname, '../.api-backup-export');

try {
  if (fs.existsSync(apiDir)) {
    fs.renameSync(apiDir, apiBackup);
    console.log('[build:static] Temporarily moved app/api aside');
  }

  execSync('OUTPUT_MODE=export npm run build --workspace=web', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });
} finally {
  if (fs.existsSync(apiBackup)) {
    if (fs.existsSync(apiDir)) fs.rmSync(apiDir, { recursive: true });
    fs.renameSync(apiBackup, apiDir);
    console.log('[build:static] Restored app/api');
  }
}
