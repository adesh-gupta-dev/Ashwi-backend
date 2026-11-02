import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/db.js';

class LogModel {
  static async createLog(userId, action, details = {}) {
    const id = uuidv4();
    await query(
      'INSERT INTO logs (id, user_id, action, details) VALUES (?, ?, ?, ?)',
      [id, userId || null, action, JSON.stringify(details)]
    );
    const rows = await query('SELECT * FROM logs WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  }

  static async getLogs(limit = 100, offset = 0) {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Number(limit))) : 100;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Number(offset)) : 0;
    return query(
      `
      SELECT l.*, u.email as user_email
      FROM logs l
      LEFT JOIN users u ON l.user_id = u.id
      ORDER BY l.created_at DESC
      LIMIT ${safeLimit} OFFSET ${safeOffset}
      `,
      []
    );
  }

  static async getLogsPaginated({ search = '', action = 'all', fromDate, toDate, limit = 20, offset = 0 }) {
    const where = ['1=1'];
    const params = [];
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Number(limit))) : 20;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Number(offset)) : 0;

    if (search) {
      where.push('(u.email LIKE ? OR l.action LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (action !== 'all') {
      where.push('l.action = ?');
      params.push(action);
    }
    if (fromDate) {
      where.push('l.created_at >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      where.push('l.created_at <= ?');
      params.push(toDate);
    }

    const whereSql = where.join(' AND ');
    const rows = await query(
      `SELECT l.*, u.email AS user_email
       FROM logs l
       LEFT JOIN users u ON l.user_id = u.id
       WHERE ${whereSql}
       ORDER BY l.created_at DESC
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params
    );

    const countRows = await query(
      `SELECT COUNT(*) AS count
       FROM logs l
       LEFT JOIN users u ON l.user_id = u.id
       WHERE ${whereSql}`,
      params
    );
    return { rows, totalCount: Number(countRows[0].count) };
  }
}

export default LogModel;
