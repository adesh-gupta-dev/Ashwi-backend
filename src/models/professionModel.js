import { query } from '../config/db.js';

class ProfessionModel {
  static async getAllActive() {
    return query(
      `
      SELECT id, key_name, label, icon, prompt, is_active
      FROM professions
      WHERE is_active = TRUE
      ORDER BY id ASC
      `
    );
  }

  static async findByKeyName(keyName) {
    const rows = await query(
      `
      SELECT id, key_name, label, icon, prompt, is_active
      FROM professions
      WHERE key_name = ? AND is_active = TRUE
      LIMIT 1
      `,
      [keyName]
    );
    return rows[0] || null;
  }

  static async findAssistant() {
    return this.findByKeyName('assistant');
  }
}

export default ProfessionModel;
