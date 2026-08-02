import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const port = Number(process.env.SECURITY_SCAN_PORT || 4330);
const baseUrl = `http://127.0.0.1:${port}`;

const audit = spawnSync(process.platform === 'win32' ? 'cmd.exe' : 'sh', process.platform === 'win32'
  ? ['/c', 'npm audit --omit=dev --audit-level=high']
  : ['-lc', 'npm audit --omit=dev --audit-level=high'],
  { cwd: rootDir, encoding: 'utf8' });

if (audit.status !== 0) {
  throw new Error(`Runtime dependency audit failed:\n${audit.stdout || ''}${audit.stderr || ''}`);
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'raisen-sec-'));
const dbPath = path.join(tempDir, 'raisen-db.json');
await writeFile(dbPath, '', 'utf8');

const builtHtml = await readFile(path.join(rootDir, 'dist', 'index.html'), 'utf8');
const assetMatch = builtHtml.match(/<script[^>]+src="([^"]+)"/i);
if (!assetMatch) {
  throw new Error('Could not find the built JavaScript asset in dist/index.html');
}
const assetPath = assetMatch[1];

const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(port),
  DB_PATH: dbPath,
  JWT_SECRET: 'security-scan-jwt-secret-value-please-change',
  MANAGER_PASSWORD: 'SecurityManager@123',
  OWNER_PASSWORD: 'SecurityOwner@123',
  SUPERVISOR_PASSWORD: 'SecuritySupervisor@123',
  SALES_PASSWORD: 'SecuritySales@123',
  HR_PASSWORD: 'SecurityHr@123',
  MAINTENANCE_PASSWORD: 'SecurityMaintenance@123',
  CORS_ORIGINS: baseUrl,
};

const server = spawn(process.execPath, [path.join(rootDir, 'server', 'index.js')], {
  cwd: rootDir,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
server.stdout.on('data', (chunk) => { output += chunk.toString(); });
server.stderr.on('data', (chunk) => { output += chunk.toString(); });

const shutdown = async () => {
  if (server.exitCode === null && !server.killed) {
    server.kill('SIGTERM');
  }
  await new Promise((resolve) => {
    if (server.exitCode !== null) return resolve();
    server.once('exit', resolve);
  });
  await rm(tempDir, { recursive: true, force: true });
};

const waitForServer = async () => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // keep waiting for the server
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Security scan server did not start. Output:\n${output}`);
};

try {
  await waitForServer();

  const rootResponse = await fetch(`${baseUrl}/`);
  const rootHtml = await rootResponse.text();
  assert.equal(rootResponse.ok, true, rootHtml);
  assert.match(rootResponse.headers.get('content-type') || '', /text\/html/i);

  const assetResponse = await fetch(`${baseUrl}${assetPath}`);
  const assetText = await assetResponse.text();
  assert.equal(assetResponse.ok, true, assetText);
  assert.match(assetResponse.headers.get('content-type') || '', /javascript|ecmascript/i);

  assert.notEqual(rootResponse.headers.get('x-powered-by'), 'Express');
  assert.equal(rootResponse.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(rootResponse.headers.get('x-frame-options'));

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  const health = await healthResponse.json();
  assert.equal(health.ok, true);

  console.log('Security scan passed');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await shutdown();
}