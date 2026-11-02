/** Build a log-safe target without exposing passwords or connection-string queries. */
export function getDatabaseTarget(config) {
  if (config.connectionString) {
    try {
      const url = new URL(config.connectionString);
      return {
        host: url.hostname,
        port: Number(url.port || 5432),
        user: decodeURIComponent(url.username),
        database: decodeURIComponent(url.pathname.slice(1)),
      };
    } catch {
      return { host: '(invalid DATABASE_URL)', port: '', user: '', database: '' };
    }
  }
  return { host: config.host, port: config.port, user: config.user, database: config.database };
}

export function describeDatabaseFailure(error, target) {
  const code = error?.code || error?.errors?.find((entry) => entry.code)?.code || 'UNKNOWN';
  const address = `${target.host}:${target.port}`;
  const suffix = ` [${code}]`;
  if (code === 'ECONNREFUSED') {
    return `Cannot connect to PostgreSQL at ${address}. Check that PostgreSQL is running and DB_PORT/PGPORT matches its listening port.${suffix}`;
  }
  if (code === '28P01' || code === '28000') {
    return `PostgreSQL rejected the credentials for user "${target.user || '(not set)'}" at ${address}. Update DB_USER and DB_PASSWORD in backend/.env. PGUSER, PGPASSWORD or DATABASE_URL take precedence when set.${suffix}`;
  }
  if (code === '3D000') {
    return `PostgreSQL database "${target.database || '(not set)'}" does not exist at ${address}. Create it or set DB_NAME/PGDATABASE to an existing application database.${suffix}`;
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return `Cannot resolve PostgreSQL host "${target.host}". Check DB_HOST/PGHOST and your network connection.${suffix}`;
  }
  if (code === 'ETIMEDOUT' || /timeout/i.test(error?.message || '')) {
    return `PostgreSQL did not respond at ${address}. Check its address, network access and firewall.${suffix}`;
  }
  return `PostgreSQL startup failed at ${address}. Check database configuration, SSL settings and permissions. Run pnpm --dir backend db:check after updating backend/.env.${suffix}`;
}
