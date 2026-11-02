import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/db.js';
import { normalizeFeatureList, parseJson } from '../utils/subscriptionUtils.js';

const buildUpdateClause = (fields) => {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (!entries.length) {
    return null;
  }

  return {
    sql: entries.map(([column]) => `${column} = ?`).join(', '),
    values: entries.map(([, value]) => value),
  };
};

const normalizePlanRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...row,
    price: row.price === null || row.price === undefined ? row.price : Number(row.price),
    duration_days: row.duration_days === null || row.duration_days === undefined ? row.duration_days : Number(row.duration_days),
    features: parseJson(row.features, []),
    is_active: Boolean(row.is_active),
    is_deleted: Boolean(row.is_deleted),
  };
};

const normalizeSubscriptionRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...row,
    plan_price: row.plan_price === null || row.plan_price === undefined ? row.plan_price : Number(row.plan_price),
    plan_duration_days: row.plan_duration_days === null || row.plan_duration_days === undefined ? row.plan_duration_days : Number(row.plan_duration_days),
    auto_renew: Boolean(row.auto_renew),
    is_deleted: Boolean(row.is_deleted),
    plan_current_is_active: row.plan_current_is_active === null || row.plan_current_is_active === undefined ? row.plan_current_is_active : Boolean(row.plan_current_is_active),
    plan_current_is_deleted: row.plan_current_is_deleted === null || row.plan_current_is_deleted === undefined ? row.plan_current_is_deleted : Boolean(row.plan_current_is_deleted),
  };
};

class SubscriptionModel {
  static async findPlanById(id, includeDeleted = false) {
    const rows = await query(
      `
      SELECT *
      FROM subscription_plans
      WHERE id = ?
        ${includeDeleted ? '' : 'AND is_deleted = FALSE'}
      LIMIT 1
      `,
      [id]
    );
    return normalizePlanRow(rows[0] || null);
  }

  static async findPlanByName(name, includeDeleted = false) {
    const rows = await query(
      `
      SELECT *
      FROM subscription_plans
      WHERE LOWER(name) = LOWER(?)
        ${includeDeleted ? '' : 'AND is_deleted = FALSE'}
      LIMIT 1
      `,
      [name]
    );
    return normalizePlanRow(rows[0] || null);
  }

  static async getPlansPaginated({ search = '', isActive = 'all', limit = 20, offset = 0 }) {
    const where = ['is_deleted = FALSE'];
    const params = [];
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Number(limit))) : 20;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Number(offset)) : 0;

    if (search) {
      where.push('(name LIKE ? OR description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (isActive === 'true' || isActive === true) {
      where.push('is_active = TRUE');
    } else if (isActive === 'false' || isActive === false) {
      where.push('is_active = FALSE');
    }

    const whereSql = where.join(' AND ');
    const rows = await query(
      `
      SELECT *
      FROM subscription_plans
      WHERE ${whereSql}
      ORDER BY created_at DESC
      LIMIT ${safeLimit} OFFSET ${safeOffset}
      `,
      params
    );

    const countRows = await query(
      `
      SELECT COUNT(*) AS count
      FROM subscription_plans
      WHERE ${whereSql}
      `,
      params
    );

    return {
      rows: rows.map((row) => normalizePlanRow(row)),
      totalCount: Number(countRows[0].count),
    };
  }

  static async createPlan({ name, description = null, price, billing_cycle, duration_days, features = [], is_active = true }) {
    const id = uuidv4();
    const serializedFeatures = JSON.stringify(normalizeFeatureList(features));

    await query(
      `
      INSERT INTO subscription_plans (
        id,
        name,
        description,
        price,
        billing_cycle,
        duration_days,
        features,
        is_active,
        is_deleted
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, FALSE)
      `,
      [
        id,
        name,
        description,
        price,
        billing_cycle,
        duration_days,
        serializedFeatures,
        is_active,
      ]
    );

    return this.findPlanById(id, true);
  }

  static async updatePlanById(id, updates) {
    const updateClause = buildUpdateClause(updates);
    if (!updateClause) {
      return this.findPlanById(id, true);
    }

    await query(
      `
      UPDATE subscription_plans
      SET ${updateClause.sql},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND is_deleted = FALSE
      `,
      [...updateClause.values, id]
    );

    return this.findPlanById(id, true);
  }

  static async softDeletePlan(id) {
    await query(
      `
      UPDATE subscription_plans
      SET is_active = FALSE,
          is_deleted = TRUE,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND is_deleted = FALSE
      `,
      [id]
    );

    return this.findPlanById(id, true);
  }

  static async getSubscriptionsPaginated({
    search = '',
    status = 'all',
    planId = 'all',
    userId = 'all',
    fromDate,
    toDate,
    limit = 20,
    offset = 0,
  }) {
    const where = ['s.is_deleted = FALSE'];
    const params = [];
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Number(limit))) : 20;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Number(offset)) : 0;

    if (search) {
      where.push('(u.email LIKE ? OR u.name LIKE ? OR p.name LIKE ? OR s.status LIKE ? OR s.notes LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status !== 'all') {
      where.push('s.status = ?');
      params.push(status);
    }

    if (planId && planId !== 'all') {
      where.push('s.plan_id = ?');
      params.push(planId);
    }

    if (userId && userId !== 'all') {
      where.push('s.user_id = ?');
      params.push(userId);
    }

    if (fromDate) {
      where.push('s.created_at >= ?');
      params.push(fromDate);
    }

    if (toDate) {
      where.push('s.created_at <= ?');
      params.push(toDate);
    }

    const whereSql = where.join(' AND ');
    const rows = await query(
      `
      SELECT
        s.*,
        u.name AS user_name,
        u.email AS user_email,
        p.is_active AS plan_current_is_active,
        p.is_deleted AS plan_current_is_deleted
      FROM subscriptions s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN subscription_plans p ON s.plan_id = p.id
      WHERE ${whereSql}
      ORDER BY s.created_at DESC
      LIMIT ${safeLimit} OFFSET ${safeOffset}
      `,
      params
    );

    const countRows = await query(
      `
      SELECT COUNT(*) AS count
      FROM subscriptions s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN subscription_plans p ON s.plan_id = p.id
      WHERE ${whereSql}
      `,
      params
    );

    return {
      rows: rows.map((row) => normalizeSubscriptionRow(row)),
      totalCount: Number(countRows[0].count),
    };
  }

  static async findSubscriptionById(id, includeDeleted = false) {
    const rows = await query(
      `
      SELECT
        s.*,
        u.name AS user_name,
        u.email AS user_email,
        p.is_active AS plan_current_is_active,
        p.is_deleted AS plan_current_is_deleted
      FROM subscriptions s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN subscription_plans p ON s.plan_id = p.id
      WHERE s.id = ?
        ${includeDeleted ? '' : 'AND s.is_deleted = FALSE'}
      LIMIT 1
      `,
      [id]
    );

    return normalizeSubscriptionRow(rows[0] || null);
  }

  static async getCurrentSubscriptionForUser(userId) {
    const rows = await query(
      `
      SELECT
        s.*,
        u.name AS user_name,
        u.email AS user_email,
        p.is_active AS plan_current_is_active,
        p.is_deleted AS plan_current_is_deleted
      FROM subscriptions s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN subscription_plans p ON s.plan_id = p.id
      WHERE s.user_id = ?
        AND s.status = 'active'
        AND s.is_deleted = FALSE
      ORDER BY s.created_at DESC
      LIMIT 1
      `,
      [userId]
    );

    return normalizeSubscriptionRow(rows[0] || null);
  }

  static async getSubscriptionHistoryByUser(userId) {
    const rows = await query(
      `
      SELECT
        s.*,
        u.name AS user_name,
        u.email AS user_email,
        p.is_active AS plan_current_is_active,
        p.is_deleted AS plan_current_is_deleted
      FROM subscriptions s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN subscription_plans p ON s.plan_id = p.id
      WHERE s.user_id = ?
        AND s.is_deleted = FALSE
      ORDER BY s.created_at DESC
      `,
      [userId]
    );

    return rows.map((row) => normalizeSubscriptionRow(row));
  }

  static async countCurrentSubscriptionsForUser(userId, excludeSubscriptionId = null) {
    const params = [userId];
    let sql = `
      SELECT COUNT(*) AS count
      FROM subscriptions
      WHERE user_id = ?
        AND is_deleted = FALSE
        AND status IN ('active', 'paused')
    `;

    if (excludeSubscriptionId) {
      sql += ' AND id <> ?';
      params.push(excludeSubscriptionId);
    }

    const rows = await query(sql, params);
    return Number(rows[0]?.count || 0);
  }

  static async createSubscription({
    user_id,
    plan_id,
    status,
    start_date,
    end_date,
    renewal_date,
    auto_renew = false,
    notes = null,
    plan_name,
    plan_price,
    plan_duration_days,
    billing_cycle,
  }) {
    const id = uuidv4();

    await query(
      `
      INSERT INTO subscriptions (
        id,
        user_id,
        plan_id,
        status,
        start_date,
        end_date,
        renewal_date,
        auto_renew,
        notes,
        plan_name,
        plan_price,
        plan_duration_days,
        billing_cycle,
        is_deleted
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)
      `,
      [
        id,
        user_id,
        plan_id,
        status,
        start_date,
        end_date,
        renewal_date,
        auto_renew,
        notes,
        plan_name,
        plan_price,
        plan_duration_days,
        billing_cycle,
      ]
    );

    return this.findSubscriptionById(id, true);
  }

  static async updateSubscriptionById(id, updates) {
    const updateClause = buildUpdateClause(updates);
    if (!updateClause) {
      return this.findSubscriptionById(id, true);
    }

    await query(
      `
      UPDATE subscriptions
      SET ${updateClause.sql},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND is_deleted = FALSE
      `,
      [...updateClause.values, id]
    );

    return this.findSubscriptionById(id, true);
  }

  static async softDeleteSubscription(id) {
    await query(
      `
      UPDATE subscriptions
      SET is_deleted = TRUE,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND is_deleted = FALSE
      `,
      [id]
    );

    return this.findSubscriptionById(id, true);
  }
}

export default SubscriptionModel;
