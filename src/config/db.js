import { Pool } from 'pg';
import logger from '../utils/logger.js';
import { getDatabaseTarget } from './databaseDiagnostics.js';

const buildPoolConfig = () => {
  // Prefer the managed Postgres pooled URLs used by Vercel integrations. A
  // stale generic DATABASE_URL must not override the active hosted database.
  const databaseUrl = process.env.DATABASE_POSTGRES_URL
    || process.env.DATABASE_POSTGRES_PRISMA_URL
    || process.env.DATABASE_URL
    || process.env.database_DATABASE_URL
    || process.env.database_POSTGRES_URL
    || process.env.database_PRISMA_DATABASE_URL;
  const common = {
    max: Number(process.env.DB_CONNECTION_LIMIT || 10),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 10000),
  };

  if (databaseUrl) {
    let isSupabaseUrl = false;
    try {
      const hostname = new URL(databaseUrl).hostname;
      isSupabaseUrl = hostname.endsWith('.supabase.co')
        || hostname.endsWith('.pooler.supabase.com');
    } catch {
      // Let pg report malformed connection strings through the normal startup diagnostics.
    }

    return {
      connectionString: databaseUrl,
      // Supabase requires TLS; enable it for Supabase URLs even when the URL omits sslmode.
      ssl: process.env.DB_SSL === 'true' || isSupabaseUrl
        ? { rejectUnauthorized: false }
        : undefined,
      ...common,
    };
  }

  return {
    host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.PGPORT || process.env.DB_PORT || 5432),
    user: process.env.PGUSER || process.env.DB_USER,
    password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
    database: process.env.PGDATABASE || process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    ...common,
  };
};

const pool = new Pool(buildPoolConfig());
const databaseTarget = getDatabaseTarget(buildPoolConfig());

pool.on('error', (error) => {
  logger.error('Unexpected PostgreSQL pool error', { message: error.message, stack: error.stack });
});

const translatePlaceholders = (sql) => {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
};

const query = async (sql, params = []) => {
  const translatedSql = translatePlaceholders(sql);
  const result = await pool.query(translatedSql, params);
  return result.rows;
};

const testDbConnection = async () => {
  await pool.query('SELECT 1 AS ok');
  logger.info('Connected to PostgreSQL database');
};

export { query, pool, testDbConnection, databaseTarget };
