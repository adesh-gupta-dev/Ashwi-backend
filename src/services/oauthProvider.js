import * as oauth from 'oauth4webapi';

export async function providerAuthorization(config, state, verifier, nonce) {
  const url = new URL(config.metadata.authorization_endpoint);
  url.search = new URLSearchParams({ client_id: config.id, redirect_uri: config.callback, response_type: 'code',
    scope: config.scope, state, code_challenge: await oauth.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256' }).toString();
  if (nonce) url.searchParams.set('nonce', nonce);
  if (config.metadata.issuer.includes('google')) url.searchParams.set('prompt', 'select_account');
  return url.href;
}

export async function fetchProviderIdentity(provider, config, params, attempt) {
  const client = { client_id: config.id };
  const validated = oauth.validateAuthResponse(config.metadata, client, params, params.get('state'));
  const response = await oauth.authorizationCodeGrantRequest(config.metadata, client,
    oauth.ClientSecretPost(config.secret), validated, config.callback, attempt.provider_verifier,
    { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
  const tokens = await oauth.processAuthorizationCodeResponse(config.metadata, client, response,
    provider === 'google' ? { expectedNonce: attempt.nonce, requireIdToken: true } : undefined);
  const headers = { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json', 'User-Agent': 'Ashwi' };
  const get = async url => {
    const result = await fetch(url, { headers, signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!result.ok) return null;
    return result.json();
  };
  if (provider === 'google') {
    const profile = await get(config.metadata.userinfo_endpoint);
    const claims = oauth.getValidatedIdTokenClaims(tokens);
    if (!profile?.sub || profile.sub !== claims?.sub || profile.email_verified !== true || typeof profile.email !== 'string') return null;
    return { provider, subject: profile.sub, email: profile.email.toLowerCase(), name: profile.name || profile.email.split('@')[0] };
  }
  const profile = await get('https://api.github.com/user');
  const emails = await get('https://api.github.com/user/emails');
  const email = Array.isArray(emails) ? emails.find(item => item.primary && item.verified)?.email : null;
  if (!profile?.id || typeof email !== 'string') return null;
  return { provider, subject: String(profile.id), email: email.toLowerCase(), name: profile.name || profile.login || email.split('@')[0] };
}
