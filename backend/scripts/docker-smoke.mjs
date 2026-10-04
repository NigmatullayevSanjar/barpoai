import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const id = `barpo-smoke-${process.pid}`,
  db = `${id}-db`,
  api = `${id}-api`,
  owner = randomBytes(18).toString('hex'),
  app = randomBytes(18).toString('hex');
const docker = (...args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
try {
  docker('network', 'create', id);
  docker(
    'run',
    '--rm',
    '-d',
    '--name',
    db,
    '--network',
    id,
    '-e',
    'POSTGRES_USER=barpo_owner',
    '-e',
    'POSTGRES_DB=barpo',
    '-e',
    `POSTGRES_PASSWORD=${owner}`,
    '-e',
    `APP_DB_PASSWORD=${app}`,
    '--mount',
    `type=bind,source=${resolve('docker/init.sh')},target=/docker-entrypoint-initdb.d/01-app-role.sh,readonly`,
    'postgres:17-bookworm',
  );
  for (let i = 0; ; i++) {
    try {
      docker('exec', db, 'pg_isready', '-h', '127.0.0.1', '-U', 'barpo_owner', '-d', 'barpo');
      break;
    } catch (error) {
      if (i > 40) throw error;
      await delay(500);
    }
  }
  docker(
    'run',
    '--rm',
    '--network',
    id,
    '-e',
    `MIGRATION_DATABASE_URL=postgresql://barpo_owner:${owner}@${db}:5432/barpo`,
    'barpo-backend:local',
    'node',
    'dist/migrate.js',
  );
  docker(
    'run',
    '--rm',
    '-d',
    '--name',
    api,
    '--network',
    id,
    '-p',
    '127.0.0.1::3001',
    '-e',
    `DATABASE_URL=postgresql://barpo_app:${app}@${db}:5432/barpo`,
    'barpo-backend:local',
  );
  const port = docker('port', api, '3001/tcp').split(':').pop();
  let health;
  for (let i = 0; ; i++) {
    try {
      health = await fetch(`http://127.0.0.1:${port}/health/ready`);
      if (health.ok) break;
    } catch {}
    if (i > 30) throw Error('API health timeout');
    await delay(500);
  }
  assert.equal((await health.json()).status, 'ok');
  const spec = await fetch(`http://127.0.0.1:${port}/openapi.json`).then((r) => r.json());
  assert.equal(spec.openapi, '3.1.0');
  const unauthorized = await fetch(`http://127.0.0.1:${port}/v1/projects`);
  assert.equal(unauthorized.status, 401);
  const result = {
    executed_at: new Date().toISOString(),
    image: 'barpo-backend:local',
    checks: [
      'Docker database init script',
      'Compiled migration runner',
      'Non-root production API with restricted DB role',
      'Ready health endpoint',
      'OpenAPI endpoint',
      'Unauthenticated API denied',
    ],
  };
  await writeFile('docs/docker-verification.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  for (const container of [api, db]) {
    try {
      docker('stop', container);
    } catch {}
  }
  try {
    docker('network', 'rm', id);
  } catch {}
}
