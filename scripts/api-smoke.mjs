import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const port = Number(process.env.SMOKE_PORT || 4310);
const baseUrl = `http://127.0.0.1:${port}`;

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'raisen-smoke-'));
const dbPath = path.join(tempDir, 'raisen-db.json');
await writeFile(dbPath, '', 'utf8');

const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(port),
  DB_PATH: dbPath,
  JWT_SECRET: 'smoke-test-jwt-secret-value-please-change',
  MANAGER_PASSWORD: 'SmokeManager@123',
  OWNER_PASSWORD: 'SmokeOwner@123',
  SUPERVISOR_PASSWORD: 'SmokeSupervisor@123',
  SALES_PASSWORD: 'SmokeSales@123',
  HR_PASSWORD: 'SmokeHr@123',
  MAINTENANCE_PASSWORD: 'SmokeMaintenance@123',
  CORS_ORIGINS: baseUrl,
};

const server = spawn(process.execPath, [path.join(rootDir, 'server', 'index.js')], {
  cwd: rootDir,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

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

const waitForHealth = async () => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // retry until the server is ready
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Server did not become ready. Output:\n${serverOutput}`);
};

const readJsonResponse = async (response) => {
  const body = await response.text();
  assert.equal(response.ok, true, body);
  return JSON.parse(body);
};

try {
  await waitForHealth();

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Smoke Manager', role: 'manager', password: env.MANAGER_PASSWORD }),
  });
  const loginData = await readJsonResponse(loginResponse);
  assert.equal(loginData.user.role, 'manager');

  const headers = {
    Authorization: `Bearer ${loginData.token}`,
    'Content-Type': 'application/json',
  };

  const meResponse = await fetch(`${baseUrl}/api/auth/me`, { headers });
  const meData = await readJsonResponse(meResponse);
  assert.equal(meData.user.name, 'Smoke Manager');

  const settingsPayload = {
    companyName: 'Smoke Test Factory',
    companyAddress: 'Test Road',
    companyPhone: '+256700000000',
    companyTin: 'TIN-SMOKE',
    bonusRate: 1000,
    vatRegistered: false,
    vatRate: 18,
    invoiceCounter: 1,
    deliveryCounter: 1,
    dispatchCounter: 1,
    receiptCounter: 1,
  };

  const settingsResponse = await fetch(`${baseUrl}/api/store/settings`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ value: JSON.stringify(settingsPayload) }),
  });
  await readJsonResponse(settingsResponse);

  const settingsGet = await fetch(`${baseUrl}/api/store/settings`, { headers });
  const settingsData = await readJsonResponse(settingsGet);
  assert.equal(JSON.parse(settingsData.value).companyName, 'Smoke Test Factory');

  const unknownCollectionResponse = await fetch(`${baseUrl}/api/store/smoke-collection`, { headers });
  assert.equal(unknownCollectionResponse.status, 404);

  const collectionName = 'employees';
  const record = { id: 'smoke-record-1', name: 'Smoke Record', amount: 123 };
  const createResponse = await fetch(`${baseUrl}/api/store/${collectionName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ value: record }),
  });
  await readJsonResponse(createResponse);

  const listResponse = await fetch(`${baseUrl}/api/store/${collectionName}`, { headers });
  const listData = await readJsonResponse(listResponse);
  const createdItems = JSON.parse(listData.value);
  assert.equal(createdItems.length, 1);
  assert.equal(createdItems[0].id, record.id);

  const deleteResponse = await fetch(`${baseUrl}/api/store/${collectionName}/${record.id}`, {
    method: 'DELETE',
    headers,
  });
  await readJsonResponse(deleteResponse);

  const afterDeleteResponse = await fetch(`${baseUrl}/api/store/${collectionName}`, { headers });
  const afterDeleteData = await readJsonResponse(afterDeleteResponse);
  assert.equal(JSON.parse(afterDeleteData.value).length, 0);

  console.log('API smoke test passed');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await shutdown();
}