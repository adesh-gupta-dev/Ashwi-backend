import crypto from 'node:crypto';
import { pool, query } from '../config/db.js';

export const hashOAuthValue = value => crypto.createHash('sha256').update(value).digest('base64url');

export const oauthStore = {
  async createAttempt(attempt) {
    await query('DELETE FROM oauth_attempts WHERE expires_at < NOW()');
    await query('DELETE FROM oauth_handoffs WHERE expires_at < NOW()');
    await query(`INSERT INTO oauth_attempts (state_hash, provider, provider_verifier, nonce, redirect_uri, client_challenge, link_user_id, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW() + INTERVAL '10 minutes')`,
    [attempt.stateHash, attempt.provider, attempt.verifier, attempt.nonce, attempt.redirectUri, attempt.challenge, attempt.userId]);
  },
  async consumeAttempt(stateHash, provider) {
    return (await query('DELETE FROM oauth_attempts WHERE state_hash = ? AND provider = ? AND expires_at > NOW() RETURNING *', [stateHash, provider]))[0];
  },
  async createHandoff(ticketHash, attempt, identity) {
    await query(`INSERT INTO oauth_handoffs (ticket_hash, client_challenge, link_user_id, identity, expires_at)
      VALUES (?, ?, ?, ?, NOW() + INTERVAL '60 seconds')`, [ticketHash, attempt.client_challenge, attempt.link_user_id, JSON.stringify(identity)]);
  },
  async consumeHandoff(ticketHash, challenge) {
    return (await query('DELETE FROM oauth_handoffs WHERE ticket_hash = ? AND client_challenge = ? AND expires_at > NOW() RETURNING *', [ticketHash, challenge]))[0];
  },
  async identities(userId) {
    return query('SELECT provider, created_at FROM oauth_identities WHERE user_id = ? ORDER BY provider', [userId]);
  },
  async resolveIdentity(identity, linkUserId) {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      // Serialize the same provider identity and email, including concurrent first sign-ins.
      for (const key of [`identity:${identity.provider}:${identity.subject}`, `email:${identity.email}`].sort()) {
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
      }
      const linked = (await db.query(`SELECT u.* FROM oauth_identities i JOIN users u ON u.id=i.user_id
        WHERE i.provider=$1 AND i.subject=$2 FOR UPDATE OF u`, [identity.provider, identity.subject])).rows[0];
      let user;
      if (linked) {
        if (linkUserId && linked.id !== linkUserId) { await db.query('ROLLBACK'); return { error: 'identity_in_use' }; }
        user = linked;
      } else if (linkUserId) {
        user = (await db.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [linkUserId])).rows[0];
        if (!user?.is_verified) { await db.query('ROLLBACK'); return { error: 'verify_account' }; }
      } else {
        const exists = (await db.query('SELECT id FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [identity.email])).rows[0];
        if (exists) { await db.query('ROLLBACK'); return { error: 'account_exists' }; }
        user = (await db.query(`INSERT INTO users (id,name,email,password_hash,is_verified)
          VALUES ($1,$2,$3,NULL,TRUE) RETURNING *`, [crypto.randomUUID(), String(identity.name).slice(0,120), identity.email])).rows[0];
      }
      if (!user?.is_active || user.is_deleted) { await db.query('ROLLBACK'); return { error: 'account_unavailable' }; }
      if (!linked) {
        const other = (await db.query('SELECT subject FROM oauth_identities WHERE user_id=$1 AND provider=$2', [user.id, identity.provider])).rows[0];
        if (other) { await db.query('ROLLBACK'); return { error: 'provider_already_linked' }; }
        await db.query('INSERT INTO oauth_identities (provider,subject,user_id) VALUES ($1,$2,$3)', [identity.provider, identity.subject, user.id]);
      }
      await db.query('COMMIT');
      return { user };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  },
};
