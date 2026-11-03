import { fileURLToPath } from 'node:url';

// Supabase uses its own CA. Other providers retain pg 8's verified-TLS
// semantics unless their URL explicitly opts into libpq compatibility.
export function normalizeDatabaseSsl(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    const hostname = (url.searchParams.get('host') || url.hostname).toLowerCase();
    const isSupabase = hostname.endsWith('.supabase.co') || hostname.endsWith('.pooler.supabase.com');
    if (isSupabase && !url.searchParams.has('sslrootcert')) {
      // Keep the CA in the URL: pg's URL parser replaces the separate ssl
      // object whenever sslmode is supplied by the hosting integration.
      url.searchParams.set('sslrootcert', fileURLToPath(new URL('./certs/supabase-ca.crt', import.meta.url)));
      url.searchParams.set('sslmode', 'verify-full');
      url.searchParams.delete('uselibpqcompat');
      return url.href;
    }
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
