import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const dataDir = path.join(__dirname, 'data');
const dataFile = process.env.DB_PATH || path.join(dataDir, 'raisen-db.json');
const port = Number(process.env.PORT || 4000);
const origins = (process.env.CORS_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173').split(',').map((value) => value.trim()).filter(Boolean);
const isProduction = process.env.NODE_ENV === 'production';
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX || 300);

function requireEnv(name, fallback, label) {
  const value = process.env[name] || fallback;
  if (isProduction && (!process.env[name] || value === fallback)) {
    throw new Error(`${label} must be set with a real value in production (${name})`);
  }
  return value;
}

const jwtSecret = requireEnv('JWT_SECRET', 'change-this-secret-before-production', 'JWT secret');

fs.mkdirSync(dataDir, { recursive: true });

const DEFAULT_ROLE_PASSWORDS = {
  manager: requireEnv('MANAGER_PASSWORD', 'Manager@123', 'Manager password'),
  owner: requireEnv('OWNER_PASSWORD', 'Owner@123', 'Owner password'),
  supervisor: requireEnv('SUPERVISOR_PASSWORD', 'Supervisor@123', 'Supervisor password'),
  sales: requireEnv('SALES_PASSWORD', 'Sales@123', 'Sales password'),
  hr: requireEnv('HR_PASSWORD', 'Hr@123', 'HR password'),
  maintenance: requireEnv('MAINTENANCE_PASSWORD', 'Maintenance@123', 'Maintenance password'),
};

const ROLE_LABELS = {
  manager: 'Manager',
  owner: 'Owner / Director',
  supervisor: 'Shift Supervisor',
  sales: 'Sales',
  hr: 'HR',
  maintenance: 'Maintenance',
};

const WRITE_COLLECTIONS = {
  manager: ['*'],
  owner: [],
  supervisor: ['attendance', 'production'],
  sales: ['customers', 'sales', 'delivery', 'dispatch', 'receipts', 'products'],
  hr: ['employees', 'attendance', 'advances'],
  maintenance: ['machines', 'maintenance'],
};

const SPECIAL_WRITE = {
  settings: ['manager'],
  rawMaterials: ['manager'],
  grn: ['manager'],
  materialIssue: ['manager'],
  expenses: ['manager'],
  cashbook: ['manager'],
  loans: ['manager'],
  loanRepayments: ['manager'],
  payables: ['manager'],
  prepayments: ['manager'],
  suppliers: ['manager'],
};

const KNOWN_COLLECTIONS = new Set([
  'settings',
  ...Object.values(WRITE_COLLECTIONS).flat().filter((value) => value && value !== '*'),
  ...Object.keys(SPECIAL_WRITE),
]);

const emptyState = () => ({
  records: [],
  authRoles: [],
  auditLogs: [],
});

function loadState() {
  try {
    if (!fs.existsSync(dataFile)) return emptyState();
    const raw = fs.readFileSync(dataFile, 'utf8');
    if (!raw.trim()) return emptyState();
    const parsed = JSON.parse(raw);
    return {
      records: Array.isArray(parsed.records) ? parsed.records : [],
      authRoles: Array.isArray(parsed.authRoles) ? parsed.authRoles : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
    };
  } catch {
    return emptyState();
  }
}

let state = loadState();

function saveState() {
  const tempFile = `${dataFile}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tempFile, dataFile);
}

function now() {
  return new Date().toISOString();
}

function seedAuthRoles() {
  if (state.authRoles.length > 0) return;
  state.authRoles = Object.entries(DEFAULT_ROLE_PASSWORDS).map(([role, password]) => ({
    role,
    passwordHash: bcrypt.hashSync(password, 10),
    label: ROLE_LABELS[role] || role,
    updatedAt: now(),
  }));
  saveState();
}

seedAuthRoles();

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: rateLimitMax }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS blocked'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
}));

function audit(actor, action, collection = null, recordId = null, note = null) {
  state.auditLogs.unshift({
    id: String(Date.now()) + Math.random().toString(36).slice(2, 7),
    ts: now(),
    actorRole: actor.role,
    actorName: actor.name,
    action,
    collection,
    recordId,
    note,
  });
  state.auditLogs = state.auditLogs.slice(0, 500);
  saveState();
}

function signUser(user) {
  return jwt.sign({ sub: user.role, role: user.role, name: user.name }, jwtSecret, { expiresIn: '12h' });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function canWrite(role, collection) {
  if (!role || role === 'owner') return false;
  if (role === 'manager') return true;
  const special = SPECIAL_WRITE[collection];
  if (special) return special.includes(role);
  const allowed = WRITE_COLLECTIONS[role] || [];
  return allowed.includes('*') || allowed.includes(collection);
}

function isKnownCollection(key) {
  return KNOWN_COLLECTIONS.has(key);
}

function safeParseJson(value) {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

function validateCollectionValue(collection, valueText) {
  const parsed = safeParseJson(valueText);
  if (!parsed.ok) return { ok: false, error: 'Value must be valid JSON' };
  if (collection === 'settings' && (typeof parsed.value !== 'object' || parsed.value === null || Array.isArray(parsed.value))) {
    return { ok: false, error: 'Settings must be a JSON object' };
  }
  if (collection !== 'settings' && !Array.isArray(parsed.value)) {
    return { ok: false, error: 'Collection data must be a JSON array' };
  }
  return { ok: true, value: parsed.value };
}

function getCollection(collection) {
  return state.records.filter((record) => record.collection === collection).map((record) => JSON.parse(record.data));
}

function setCollection(collection, items) {
  const timestamp = now();
  state.records = state.records.filter((record) => record.collection !== collection);
  for (const item of items) {
    state.records.push({
      collection,
      id: item.id,
      data: JSON.stringify(item),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  saveState();
}

function getSettings() {
  const record = state.records.find((item) => item.collection === 'settings');
  return record ? record.data : null;
}

function setSettings(value) {
  state.records = state.records.filter((record) => record.collection !== 'settings');
  state.records.push({
    collection: 'settings',
    id: 'settings',
    data: JSON.stringify(value),
    createdAt: now(),
    updatedAt: now(),
  });
  saveState();
}

function upsertRecord(collection, record) {
  state.records = state.records.filter((item) => !(item.collection === collection && item.id === record.id));
  state.records.push({
    collection,
    id: record.id,
    data: JSON.stringify(record),
    createdAt: now(),
    updatedAt: now(),
  });
  saveState();
}

function deleteRecord(collection, id) {
  state.records = state.records.filter((record) => !(record.collection === collection && record.id === id));
  saveState();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'FactoryOS API', time: now() });
});

app.post('/api/auth/login', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const role = String(req.body?.role || '').trim();
  const password = String(req.body?.password || '');
  if (!name || !role || !password) return res.status(400).json({ error: 'Name, role, and password are required' });
  const row = state.authRoles.find((item) => item.role === role);
  if (!row) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = bcrypt.compareSync(password, row.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const user = { name, role, label: row.label };
  audit(user, 'login');
  return res.json({ token: signUser(user), user });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ user: { name: req.user.name, role: req.user.role } });
});

app.get('/api/store/:key', authRequired, (req, res) => {
  const { key } = req.params;
  if (!isKnownCollection(key)) return res.status(404).json({ error: 'Unknown collection' });
  if (key === 'settings') {
    return res.json({ value: getSettings() });
  }
  return res.json({ value: JSON.stringify(getCollection(key)) });
});

app.put('/api/store/:key', authRequired, (req, res) => {
  const { key } = req.params;
  if (!isKnownCollection(key)) return res.status(404).json({ error: 'Unknown collection' });
  const value = String(req.body?.value ?? '');
  if (!canWrite(req.user.role, key)) return res.status(403).json({ error: 'Not allowed to modify this collection' });
  const parsed = validateCollectionValue(key, value);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  if (key === 'settings') {
    setSettings(parsed.value);
    audit({ name: req.user.name, role: req.user.role }, 'update-settings', key, 'settings saved');
    return res.json({ ok: true });
  }

  setCollection(key, parsed.value);
  audit({ name: req.user.name, role: req.user.role }, 'replace-collection', key, null, `items=${parsed.value.length}`);
  return res.json({ ok: true });
});

app.post('/api/store/:key', authRequired, (req, res) => {
  const { key } = req.params;
  if (!isKnownCollection(key)) return res.status(404).json({ error: 'Unknown collection' });
  if (!canWrite(req.user.role, key)) return res.status(403).json({ error: 'Not allowed to modify this collection' });
  const value = req.body?.value;
  if (!value || typeof value !== 'object') return res.status(400).json({ error: 'Record payload is required' });
  if (!value.id) return res.status(400).json({ error: 'Record id is required' });
  upsertRecord(key, value);
  audit({ name: req.user.name, role: req.user.role }, 'upsert-record', key, value.id);
  return res.json({ ok: true, value });
});

app.delete('/api/store/:key/:id', authRequired, (req, res) => {
  const { key, id } = req.params;
  if (!isKnownCollection(key)) return res.status(404).json({ error: 'Unknown collection' });
  if (!canWrite(req.user.role, key)) return res.status(403).json({ error: 'Not allowed to modify this collection' });
  deleteRecord(key, id);
  audit({ name: req.user.name, role: req.user.role }, 'delete-record', key, id);
  return res.json({ ok: true });
});

app.get('/api/audit', authRequired, (_req, res) => {
  res.json({ items: state.auditLogs.slice(0, 200) });
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  const message = err?.message || 'Server error';
  res.status(500).json({ error: message });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`FactoryOS API running on http://0.0.0.0:${port}`);
  console.log(`Database: ${dataFile}`);
});
