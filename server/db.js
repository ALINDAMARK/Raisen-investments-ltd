import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => console.error('PG pool error:', err));

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS collections (
      id BIGSERIAL PRIMARY KEY,
      collection TEXT NOT NULL,
      record_id TEXT NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (collection, record_id)
    );
    CREATE INDEX IF NOT EXISTS idx_collections_collection ON collections(collection);

    CREATE TABLE IF NOT EXISTS settings (
      id INT PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (id = 1)
    );

    CREATE TABLE IF NOT EXISTS auth_roles (
      role TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      label TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      ts TIMESTAMPTZ NOT NULL DEFAULT now(),
      actor_role TEXT,
      actor_name TEXT,
      action TEXT NOT NULL,
      collection TEXT,
      record_id TEXT,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(ts DESC);
  `);
}