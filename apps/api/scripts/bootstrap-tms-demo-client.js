const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

function parseArgs(argv) {
  const args = {};
  for (const item of argv.slice(2)) {
    const [key, ...rest] = item.replace(/^--/, '').split('=');
    args[key] = rest.length ? rest.join('=') : 'true';
  }
  return args;
}

function parseEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function setEnvValue(content, key, value) {
  const escaped = `${key}="${String(value).replace(/"/g, '\\"')}"`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) return content.replace(pattern, escaped);
  return `${content.replace(/\s*$/, '')}\n${escaped}\n`;
}

function hashSecret(raw) {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function generateSecret() {
  return `hs_tms_demo_${crypto.randomBytes(32).toString('base64url')}`;
}

async function main() {
  const args = parseArgs(process.argv);
  const envFile = args['env-file'] ? path.resolve(args['env-file']) : null;
  Object.assign(process.env, parseEnvFile(envFile), process.env);
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required in env or --env-file');

  const prisma = new PrismaClient();
  const label = process.env.TMS_DEMO_CLIENT_LABEL || 'Temporary checkout demo';
  const clientSecret = process.env.TMS_DEMO_CLIENT_SECRET?.trim() || generateSecret();

  try {
    const user = process.env.TMS_DEMO_USER_ID?.trim()
      ? await prisma.user.findUnique({ where: { id: process.env.TMS_DEMO_USER_ID.trim() } })
      : await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, orderBy: { createdAt: 'asc' } });
    if (!user) throw new Error('Could not resolve demo owner user. Set TMS_DEMO_USER_ID or create an active ADMIN user.');

    const publicId = process.env.TMS_DEMO_CLIENT_ID?.trim();
    const existing = publicId
      ? await prisma.tmsM2mClient.findUnique({ where: { publicId } })
      : await prisma.tmsM2mClient.findFirst({ where: { userId: user.id, label }, orderBy: { createdAt: 'desc' } });

    const data = {
      userId: user.id,
      label,
      secretHash: hashSecret(clientSecret),
      scopes: ['tms:read', 'tms:write'],
      revokedAt: null,
    };
    const row = existing
      ? await prisma.tmsM2mClient.update({ where: { id: existing.id }, data })
      : await prisma.tmsM2mClient.create({ data: { ...data, publicId: crypto.randomUUID() } });

    if (envFile && args['write-env'] === 'true') {
      const current = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
      const next = [
        ['TMS_DEMO_CLIENT_ID', row.publicId],
        ['TMS_DEMO_CLIENT_SECRET', clientSecret],
        ['TMS_DEMO_ORIGIN_LABEL', process.env.TMS_DEMO_ORIGIN_LABEL || 'Москва, Склад HandySeller'],
        ['TMS_DEMO_SHIPPER_NAME', process.env.TMS_DEMO_SHIPPER_NAME || 'Склад HandySeller'],
        ['TMS_DEMO_SHIPPER_PHONE', process.env.TMS_DEMO_SHIPPER_PHONE || '+79990001122'],
      ].reduce((acc, [key, value]) => setEnvValue(acc, key, value), current);
      fs.writeFileSync(envFile, next);
    }

    console.log(JSON.stringify({
      ok: true,
      userId: user.id,
      clientId: row.publicId,
      clientSecret: `${clientSecret.slice(0, 10)}...${clientSecret.slice(-4)}`,
      envFileUpdated: Boolean(envFile && args['write-env'] === 'true'),
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
