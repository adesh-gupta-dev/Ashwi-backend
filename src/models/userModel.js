import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/db.js';

class UserModel {
  static async create({ name, email, passwordHash, role = 'user', verificationToken }) {
    const id = uuidv4();
    await query(
      `
      INSERT INTO users (id, name, email, password_hash, role, verification_token)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [id, name, email, passwordHash, role, verificationToken]
    );
    return this.findById(id);
  }

  static async findByEmail(email) {
    const rows = await query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND is_deleted = FALSE LIMIT 1',
      [email]
    );
    return rows[0] || null;
  }

  static async findById(id) {
    const rows = await query(
      'SELECT id, name, email, role, is_active, is_verified, created_at FROM users WHERE id = ? AND is_deleted = FALSE LIMIT 1',
      [id]
    );
    return rows[0] || null;
  }

  static async getAllUsers(limit = 50, offset = 0) {
    return query(
      'SELECT id, name, email, role, is_active, is_verified, created_at FROM users WHERE is_deleted = FALSE ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
  }

  static async getUsersPaginated({ search = '', status = 'all', limit = 20, offset = 0 }) {
    const where = ['is_deleted = FALSE'];
    const params = [];
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Number(limit))) : 20;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Number(offset)) : 0;

    if (search) {
      where.push('email LIKE ?');
      params.push(`%${search}%`);
    }

    if (status === 'active') {
      where.push('is_active = TRUE');
    } else if (status === 'blocked') {
      where.push('is_active = FALSE');
    }

    const whereSql = where.join(' AND ');
    const rows = await query(
      `SELECT id, name, email, role, is_active, is_verified, created_at
       FROM users
       WHERE ${whereSql}
       ORDER BY created_at DESC
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params
    );

    const countRows = await query(`SELECT COUNT(*) AS count FROM users WHERE ${whereSql}`, params);
    return { rows, totalCount: Number(countRows[0].count) };
  }

  static async updateStatus(id, isActive) {
    await query(
      'UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = FALSE',
      [isActive, id]
    );
    const rows = await query('SELECT id, name, email, is_active FROM users WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  }

  static async softDelete(id) {
    await query('UPDATE users SET is_deleted = TRUE, is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    const rows = await query('SELECT id FROM users WHERE id = ? AND is_deleted = TRUE LIMIT 1', [id]);
    return rows[0] || null;
  }

  static async verifyEmail(token) {
    const existing = await query('SELECT id, email FROM users WHERE verification_token = ? LIMIT 1', [token]);
    if (!existing[0]) {
      return null;
    }

    await query(
      `
      UPDATE users 
      SET is_verified = TRUE, verification_token = NULL 
      WHERE verification_token = ?
      `,
      [token]
    );
    return existing[0];
  }

  static async setVerificationTokenById(userId, verificationToken) {
    await query('UPDATE users SET verification_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [verificationToken, userId]);
    const rows = await query('SELECT id, email, is_verified FROM users WHERE id = ? LIMIT 1', [userId]);
    return rows[0] || null;
  }

  static async setResetTokenByEmail(email, resetToken, resetTokenExpires) {
    await query(
      'UPDATE users SET reset_token = ?, reset_token_expires = ?, updated_at = CURRENT_TIMESTAMP WHERE LOWER(email) = LOWER(?) AND is_deleted = FALSE',
      [resetToken, resetTokenExpires, email]
    );
    const rows = await query('SELECT id, email FROM users WHERE LOWER(email) = LOWER(?) AND is_deleted = FALSE LIMIT 1', [email]);
    return rows[0] || null;
  }

  static async findByResetToken(resetToken) {
    const rows = await query(
      `SELECT * FROM users 
       WHERE reset_token = ? 
         AND reset_token_expires IS NOT NULL 
         AND reset_token_expires > NOW()
         AND is_deleted = FALSE
       LIMIT 1`,
      [resetToken]
    );
    return rows[0] || null;
  }

  static async updatePasswordById(userId, passwordHash) {
    await query(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [passwordHash, userId]
    );
    const rows = await query('SELECT id, email, name, role, is_verified FROM users WHERE id = ? LIMIT 1', [userId]);
    return rows[0] || null;
  }

  static async updateNameById(userId, name) {
    await query(
      'UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = FALSE',
      [name, userId]
    );
    const rows = await query('SELECT id, name, email, role, is_verified FROM users WHERE id = ? LIMIT 1', [userId]);
    return rows[0] || null;
  }

  static async updateRoleById(userId, role) {
    await query(
      'UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = FALSE',
      [role, userId]
    );
    const rows = await query('SELECT id, name, email, role, is_active, is_verified, created_at FROM users WHERE id = ? LIMIT 1', [userId]);
    return rows[0] || null;
  }
}

export default UserModel;
