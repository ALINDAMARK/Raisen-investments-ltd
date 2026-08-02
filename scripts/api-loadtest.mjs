import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const port = Number(process.env.LOADTEST_PORT || 4320);
const baseUrl = `http://127.0.0.1:${port}`;

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'raisen-load-'));
const dbPath = path.join(tempDir, 'raisen-db.json');
await writeFile(dbPath, '', 'utf8');

const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(port),
  DB_PATH: dbPath,
  JWT_SECRET: 'load-test-jwt-secret-value-please-change',
  MANAGER_PASSWORD: 'LoadManager@123',
  OWNER_PASSWORD: 'LoadOwner@123',
  SUPERVISOR_PASSWORD: 'LoadSupervisor@123',
  SALES_PASSWORD: 'LoadSales@123',
  HR_PASSWORD: 'LoadHr@123',
  MAINTENANCE_PASSWORD: 'LoadMaintenance@123',
  CORS_ORIGINS: baseUrl,
  RATE_LIMIT_MAX: '100000',
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
      // keep polling until ready
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Load test server did not start. Output:\n${output}`);
};

const readJson = async (response) => {
  const body = await response.text();
  assert.equal(response.ok, true, body);
  return JSON.parse(body);
};

try {
  await waitForServer();

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Load Manager', role: 'manager', password: env.MANAGER_PASSWORD }),
  });
  const loginData = await readJson(loginResponse);
  const headers = { Authorization: `Bearer ${loginData.token}` };

  const settingsPayload = {
    companyName: 'Load Test Factory',
    companyAddress: 'Benchmark Road',
    companyPhone: '+256700000000',
    companyTin: 'TIN-LOAD',
    bonusRate: 1000,
    vatRegistered: false,
    vatRate: 18,
    invoiceCounter: 1,
    deliveryCounter: 1,
    dispatchCounter: 1,
    receiptCounter: 1,
  };

  const seedSettingsResponse = await fetch(`${baseUrl}/api/store/settings`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: JSON.stringify(settingsPayload) }),
  });
  await readJson(seedSettingsResponse);

  const settingsResponse = await fetch(`${baseUrl}/api/store/settings`, { headers });
  const settingsData = await readJson(settingsResponse);
  assert.ok(settingsData.value);

  const durationSeconds = Number(process.env.LOADTEST_DURATION || 10);
  const workers = Number(process.env.LOADTEST_CONNECTIONS || 20);
  const requestTimeoutMs = Number(process.env.LOADTEST_REQUEST_TIMEOUT_MS || 2000);
  const endAt = Date.now() + durationSeconds * 1000;
  let requests = 0;
  let errors = 0;
  const latencies = [];

  const worker = async () => {
    while (Date.now() < endAt) {
      const startedAt = performance.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(`${baseUrl}/api/store/settings`, { headers, signal: controller.signal });
        const body = await response.text();
        if (!response.ok) {
          errors += 1;
          continue;
        }
        JSON.parse(body);
        requests += 1;
        latencies.push(performance.now() - startedAt);
      } catch {
        errors += 1;
      } finally {
        clearTimeout(timeout);
      }
    }
  };

  await Promise.all(Array.from({ length: workers }, () => worker()));

  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const averageLatency = latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0;
  const p95Latency = sortedLatencies.length ? sortedLatencies[Math.min(sortedLatencies.length - 1, Math.floor(sortedLatencies.length * 0.95))] : 0;
  const requestsPerSecond = requests / durationSeconds;

  assert.equal(errors, 0, `Load test errors: ${errors}`);
  assert.ok(requests > 0, 'Load test produced no requests');
  console.log(JSON.stringify({
    requestsPerSecond: Number(requestsPerSecond.toFixed(2)),
    averageLatencyMs: Number(averageLatency.toFixed(2)),
    latencyP95Ms: Number(p95Latency.toFixed(2)),
    requests,
  }, null, 2));
  console.log('API load test passed');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await shutdown();
}