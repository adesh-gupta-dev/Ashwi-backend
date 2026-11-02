import crypto from 'node:crypto';
import { oauthConfig, allowedOAuthRedirect } from '../config/oauth.js';
import { oauthStore, hashOAuthValue } from '../models/oauthModel.js';
import { providerAuthorization, fetchProviderIdentity } from '../services/oauthProvider.js';
import { generateToken } from '../utils/jwtUtils.js';
import logger from '../utils/logger.js';

const messages = {
  denied: 'Sign-in was cancelled. You can try again.',
  failed: 'Unable to complete provider sign-in. Please try again.',
  account_exists: 'An account already uses this email. Sign in with your existing method, then connect this provider in Settings.',
  account_unavailable: 'This account is unavailable. Contact support.',
  identity_in_use: 'This provider account is connected to another Ashwi account.',
  provider_already_linked: 'A different account from this provider is already connected.',
  verify_account: 'Verify your Ashwi email before connecting another sign-in method.',
};

export function createOAuthHandlers({ store = oauthStore, config = oauthConfig, getIdentity = fetchProviderIdentity, signToken = generateToken } = {}) {
  const noCache = res => res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  return {
    providers: (_req, res) => {
      noCache(res);
      const { providers } = config();
      return res.json({ success: true, providers: Object.fromEntries(Object.entries(providers).map(([key,value]) => [key, !!(value.id && value.secret)])) });
    },
    linked: async (req, res) => {
      noCache(res);
      try { return res.json({ success: true, data: await store.identities(req.user.id) }); }
      catch { logger.warn('oauth.linked.failed'); return res.status(503).json({ error: 'Unable to load connected accounts.' }); }
    },
    start: async (req, res) => {
      noCache(res);
      const settings = config();
      const provider = settings.providers[req.params.provider];
      if (!provider || !['google','github'].includes(req.params.provider)) return res.status(404).json({ error: 'Unknown sign-in provider.' });
      if (!provider.id || !provider.secret) return res.status(503).json({ error: `${req.params.provider === 'google' ? 'Google' : 'GitHub'} sign-in is not configured on the server yet.` });
      const { redirectUri, codeChallenge } = req.body || {};
      if (!allowedOAuthRedirect(redirectUri, settings) || typeof codeChallenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
        return res.status(400).json({ error: 'Invalid sign-in request or return URL.' });
      }
      if (req.user && !req.user.is_verified) return res.status(403).json({ error: messages.verify_account });
      try {
        const state = crypto.randomBytes(32).toString('base64url');
        const verifier = crypto.randomBytes(32).toString('base64url');
        const nonce = crypto.randomBytes(32).toString('base64url');
        const authorizationUrl = await providerAuthorization(provider, state, verifier, req.params.provider === 'google' ? nonce : null);
        await store.createAttempt({ stateHash: hashOAuthValue(state), provider: req.params.provider, verifier, nonce, redirectUri, challenge: codeChallenge, userId: req.user?.id || null });
        return res.json({ success: true, authorizationUrl });
      } catch { logger.warn('oauth.start.failed', { provider: req.params.provider }); return res.status(503).json({ error: messages.failed }); }
    },
    callback: async (req, res) => {
      noCache(res);
      let attempt;
      try {
        const providerName = req.params.provider;
        const settings = config();
        const provider = settings.providers[providerName];
        if (!provider || typeof req.query.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(req.query.state)) return res.status(400).json({ error: 'Invalid or expired sign-in state. Start again from Ashwi.' });
        attempt = await store.consumeAttempt(hashOAuthValue(req.query.state), providerName);
        if (!attempt || !allowedOAuthRedirect(attempt.redirect_uri, settings)) return res.status(400).json({ error: 'Invalid or expired sign-in state. Start again from Ashwi.' });
        const target = new URL(attempt.redirect_uri);
        if (req.query.error) { target.searchParams.set('error', 'denied'); return res.redirect(303, target.href); }
        if (typeof req.query.code !== 'string' || req.query.code.length > 2048) { target.searchParams.set('error','failed'); return res.redirect(303,target.href); }
        const params = new URL(req.originalUrl, 'http://localhost').searchParams;
        const identity = await getIdentity(providerName, provider, params, attempt);
        if (!identity) { target.searchParams.set('error', 'failed'); return res.redirect(303,target.href); }
        const ticket = crypto.randomBytes(32).toString('base64url');
        // Only a short-lived, PKCE-bound ticket crosses the browser URL. No JWT/provider token.
        await store.createHandoff(hashOAuthValue(ticket), attempt, identity);
        target.searchParams.set('ticket', ticket);
        return res.redirect(303, target.href);
      } catch {
        logger.warn('oauth.callback.failed', { provider: req.params.provider });
        if (attempt && allowedOAuthRedirect(attempt.redirect_uri, config())) {
          const target = new URL(attempt.redirect_uri); target.searchParams.set('error','failed'); return res.redirect(303,target.href);
        }
        return res.status(400).json({ error: messages.failed });
      }
    },
    exchange: async (req, res) => {
      noCache(res);
      const { ticket, codeVerifier } = req.body || {};
      if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ticket) || typeof codeVerifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) return res.status(400).json({ error: 'Invalid sign-in response. Please start again.' });
      try {
        const handoff = await store.consumeHandoff(hashOAuthValue(ticket), hashOAuthValue(codeVerifier));
        if (!handoff) return res.status(400).json({ error: 'Sign-in expired or was already completed. Please start again.' });
        const result = await store.resolveIdentity(handoff.identity, handoff.link_user_id);
        if (result.error) return res.status(409).json({ error: messages[result.error] || messages.failed });
        const user = result.user;
        return res.json({ success: true, linked: !!handoff.link_user_id,
          token: signToken({ id: user.id, role: user.role, email: user.email }),
          user: { id:user.id, name:user.name, email:user.email, role:user.role, isVerified:!!user.is_verified } });
      } catch { logger.warn('oauth.exchange.failed'); return res.status(503).json({ error: messages.failed }); }
    },
  };
}

export const oauthHandlers = createOAuthHandlers();
