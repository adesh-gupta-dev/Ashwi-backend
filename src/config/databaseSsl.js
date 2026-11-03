// Keep pg 8's verified-TLS semantics explicit across driver upgrades. Respect
// URLs that deliberately opt into libpq compatibility or another SSL mode.
export function normalizeDatabaseSsl(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    if (url.searchParams.get('uselibpqcompat') !== 'true'
      && ['prefer', 'require', 'verify-ca'].includes(url.searchParams.get('sslmode'))) {
      url.searchParams.set('sslmode', 'verify-full');
      return url.href;
    }
  } catch {
    // Leave invalid URLs to pg's normal, credential-safe error handling.
  }
  return databaseUrl;
}
