import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/db.js';

class ChatModel {
  static async saveChat({ userId, professionId, sessionId, personaRole, userMessage, aiResponse }) {
    const id = uuidv4();
    await query(
      `
      INSERT INTO chats (id, user_id, profession_id, session_id, persona_role, user_message, ai_response)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [id, userId, professionId, sessionId, personaRole, userMessage, aiResponse]
    );
    const rows = await query('SELECT * FROM chats WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  }

  static async getHistoryByUser(userId, limit = 50, offset = 0) {
    return query(
      `
      SELECT c.*, p.key_name AS profession_key, p.label AS profession_label
      FROM chats c
      LEFT JOIN professions p ON p.id = c.profession_id
      WHERE user_id = ? 
      ORDER BY c.created_at DESC 
      LIMIT ? OFFSET ?
      `,
      [userId, limit, offset]
    );
  }

  static async getHistoryBySession(userId, sessionId) {
    return query(
      `
      SELECT c.*, p.key_name AS profession_key, p.label AS profession_label
      FROM chats c
      LEFT JOIN professions p ON p.id = c.profession_id
      WHERE c.user_id = ? AND c.session_id = ?
      ORDER BY c.created_at ASC
      `,
      [userId, sessionId]
    );
  }

  static async getSessionsByUser(userId) {
    return query(
      `
      SELECT
        session_id,
        title,
        first_message_at,
        last_message_at,
        message_count
      FROM (
        SELECT
          session_id,
          user_message AS title,
          created_at AS first_message_at,
          MAX(created_at) OVER (PARTITION BY session_id) AS last_message_at,
          COUNT(*) OVER (PARTITION BY session_id) AS message_count,
          ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at ASC, id ASC) AS rn
        FROM chats
        WHERE user_id = ?
      ) sessions
      WHERE rn = 1
      ORDER BY last_message_at DESC
      `,
      [userId]
    );
  }
}

export default ChatModel;
