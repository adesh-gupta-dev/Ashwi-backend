const trim = value => (value || '').trim().replace(/\/+$/, '');

function publicApiUrl(env) {
  const candidates = [env.OAUTH_PUBLIC_API_URL, env.API_BASE_URL, env.BACKEND_PUBLIC_URL];
  if (env.NODE_ENV !== 'production' && env.VERCEL !== '1') {
    return trim(candidates.find(value => value?.trim()) || `http://localhost:${env.PORT || 5000}`);
  }
  // Local .env values are sometimes copied into Vercel. Provider callbacks
  // must return to the deployed broker, never the visitor's localhost.
  for (const candidate of candidates) {
    try {
      const url = new URL(trim(candidate));
      const host = url.hostname.toLowerCase();
      if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
        && host !== 'localhost' && !host.endsWith('.localhost') && !host.startsWith('127.') && host !== '[::1]') {
        return trim(url.href);
      }
    } catch { /* Try the next configured public URL. */ }
  }
  return 'https://ashwiapi.vercel.app';
}

export function oauthConfig(env = process.env) {
  const api = publicApiUrl(env);
  const frontend = trim(env.NODE_ENV === 'production'
    ? 'https://chatwithashwi.vercel.app'
    : env.FRONTEND_PUBLIC_URL || env.CLIENT_URL || 'http://localhost:3000');
  const redirectUris = [...new Set([
    ...(`${frontend}/oauth/callback`).split(',').map(value => value.trim()).filter(Boolean),
    'https://chatwithashwi.vercel.app/oauth/callback',
    ...(env.OAUTH_REDIRECT_URIS || '').split(',').map(value => value.trim()).filter(Boolean),
  ])];
  return {
    redirectUris,
    providers: {
      google: { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET, callback: `${api}/api/auth/oauth/google/callback`,
        metadata: { issuer: 'https://accounts.google.com', authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth', token_endpoint: 'https://oauth2.googleapis.com/token', userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo' }, scope: 'openid email profile' },
      github: { id: env.GITHUB_CLIENT_ID, secret: env.GITHUB_CLIENT_SECRET, callback: `${api}/api/auth/oauth/github/callback`,
        metadata: { issuer: 'https://github.com', authorization_endpoint: 'https://github.com/login/oauth/authorize', token_endpoint: 'https://github.com/login/oauth/access_token' }, scope: 'read:user user:email' },
    },
  };
}

export function allowedOAuthRedirect(uri, config = oauthConfig()) {
  if (typeof uri !== 'string' || !config.redirectUris.includes(uri)) return false;
  try {
    const url = new URL(uri);
    if (url.username || url.password || url.search || url.hash) return false;
    return url.protocol === 'https:' ||
      (process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) ||
      (url.protocol === 'ashwi:' && url.hostname === 'oauth' && url.pathname === '/callback');
  } catch { return false; }
}
