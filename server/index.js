// ===== SET TIMEZONE TO EAT (UTC+3) =====
process.env.TZ = process.env.TZ || 'Africa/Kampala';

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
import { pool, initSchema } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const port = Number(process.env.PORT || 4000);
const origins = (process.env.CORS_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173')
  .split(',').map((value) => value.trim()).filter(Boolean);
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

/* ---------------------------------------------------------------- *
 *  Postgres data access
 * ---------------------------------------------------------------- */
async function seedAuthRoles() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM auth_roles');
  if (rows[0].c > 0) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [role, password] of Object.entries(DEFAULT_ROLE_PASSWORDS)) {
      await client.query(
        `INSERT INTO auth_roles (role, password_hash, label)
         VALUES ($1, $2, $3)
         ON CONFLICT (role) DO NOTHING`,
        [role, bcrypt.hashSync(password, 10), ROLE_LABELS[role] || role]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function audit(actor, action, collection = null, recordId = null, note = null) {
  await pool.query(
    `INSERT INTO audit_logs (actor_role, actor_name, action, collection, record_id, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [actor.role, actor.name, action, collection, recordId, note]
  );
  await pool.query(
    `DELETE FROM audit_logs
     WHERE id NOT IN (SELECT id FROM audit_logs ORDER BY ts DESC LIMIT 500)`
  );
}

async function getCollection(collection) {
  const { rows } = await pool.query(
    `SELECT data FROM collections WHERE collection = $1 ORDER BY created_at ASC, record_id ASC`,
    [collection]
  );
  return rows.map((r) => r.data);
}

async function setCollection(collection, items) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM collections WHERE collection = $1', [collection]);
    for (const item of items) {
      await client.query(
        `INSERT INTO collections (collection, record_id, data) VALUES ($1, $2, $3)`,
        [collection, String(item.id), item]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getSettings() {
  const { rows } = await pool.query('SELECT data FROM settings WHERE id = 1');
  return rows[0]?.data ?? null;
}

async function setSettings(value) {
  await pool.query(
    `INSERT INTO settings (id, data) VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [value]
  );
}

async function upsertRecord(collection, record) {
  await pool.query(
    `INSERT INTO collections (collection, record_id, data)
     VALUES ($1, $2, $3)
     ON CONFLICT (collection, record_id)
     DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [collection, String(record.id), record]
  );
}

async function deleteRecord(collection, id) {
  await pool.query(
    `DELETE FROM collections WHERE collection = $1 AND record_id = $2`,
    [collection, String(id)]
  );
}

/* ---------------------------------------------------------------- *
 *  auth helpers
 * ---------------------------------------------------------------- */
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

const isKnownCollection = (key) => KNOWN_COLLECTIONS.has(key);

function validateCollectionValue(collection, valueText) {
  let parsed;
  try { parsed = JSON.parse(valueText); } catch { return { ok: false, error: 'Value must be valid JSON' }; }
  if (collection === 'settings') {
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: 'Settings must be a JSON object' };
    }
  } else if (!Array.isArray(parsed)) {
    return { ok: false, error: 'Collection data must be a JSON array' };
  }
  return { ok: true, value: parsed };
}

/* ---------------------------------------------------------------- *
 *  app
 * ---------------------------------------------------------------- */
const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: rateLimitMax }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS blocked'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
}));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'FactoryOS API', time: new Date().toISOString() });
  } catch {
    res.status(500).json({ ok: false, error: 'DB unavailable' });
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const role = String(req.body?.role || '').trim();
    const password = String(req.body?.password || '');
    if (!name || !role || !password) return res.status(400).json({ error: 'Name, role, and password are required' });

    const { rows } = await pool.query('SELECT role, password_hash, label FROM auth_roles WHERE role = $1', [role]);
    const row = rows[0];
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password, row.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });

    const user = { name, role, label: row.label };
    await audit(user, 'login');
    return res.json({ token: signUser(user), user });
  } catch (e) { next(e); }
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ user: { name: req.user.name, role: req.user.role } });
});

app.get('/api/store/:key', authRequired, async (req, res, next) => {
  try {
    const { key } = req.params;
    if (!isKnownCollection(key)) return res.status(404).json({ error: 'Unknown collection' });
    if (key === 'settings') {
      const value = await getSettings();
      return res.json({ value: value ? JSON.stringify(value) : null });
    }
    return res.json({ value: JSON.stringify(await getCollection(key)) });
  } catch (e) { next(e); }
});

app.put('/api/store/:key', authRequired, async (req, res, next) => {
  try {
    const { key } = req.params;
    if (!isKnownCollection(key)) return res.status(404).json({ error: 'Unknown collection' });
    if (!canWrite(req.user.role, key)) return res.status(403).json({ error: 'Not allowed to modify this collection' });

    const value = String(req.body?.value ?? '');
    const parsed = validateCollectionValue(key, value);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });

    if (key === 'settings') {
      await setSettings(parsed.value);
      await audit({ name: req.user.name, role: req.user.role }, 'update-settings', key, 'settings', 'settings saved');
      return res.json({ ok: true });
    }

    await setCollection(key, parsed.value);
    await audit({ name: req.user.name, role: req.user.role }, 'replace-collection', key, null, `items=${parsed.value.length}`);
    return res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post('/api/store/:key', authRequired, async (req, res, next) => {
  try {
    const { key } = req.params;
    if (!isKnownCollection(key)) return res.status(404).json({ error: 'Unknown collection' });
    if (!canWrite(req.user.role, key)) return res.status(403).json({ error: 'Not allowed to modify this collection' });
    const value = req.body?.value;
    if (!value || typeof value !== 'object') return res.status(400).json({ error: 'Record payload is required' });
    if (!value.id) return res.status(400).json({ error: 'Record id is required' });
    await upsertRecord(key, value);
    await audit({ name: req.user.name, role: req.user.role }, 'upsert-record', key, String(value.id));
    return res.json({ ok: true, value });
  } catch (e) { next(e); }
});

app.delete('/api/store/:key/:id', authRequired, async (req, res, next) => {
  try {
    const { key, id } = req.params;
    if (!isKnownCollection(key)) return res.status(404).json({ error: 'Unknown collection' });
    if (!canWrite(req.user.role, key)) return res.status(403).json({ error: 'Not allowed to modify this collection' });
    await deleteRecord(key, id);
    await audit({ name: req.user.name, role: req.user.role }, 'delete-record', key, id);
    return res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get('/api/audit', authRequired, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ts, actor_role AS "actorRole", actor_name AS "actorName",
              action, collection, record_id AS "recordId", note
       FROM audit_logs ORDER BY ts DESC LIMIT 200`
    );
    res.json({ items: rows });
  } catch (e) { next(e); }
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err?.message || 'Server error' });
});

(async () => {
  try {
    await initSchema();
    await seedAuthRoles();
    app.listen(port, '0.0.0.0', () => {
      console.log(`FactoryOS API running on http://0.0.0.0:${port}`);
      console.log('Database: Neon Postgres');
    });
  } catch (e) {
    console.error('Failed to start:', e);
    process.exit(1);
  }
})();