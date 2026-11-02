const SUBSCRIPTION_STATUSES = ['active', 'inactive', 'expired', 'cancelled', 'paused'];
const CURRENT_SUBSCRIPTION_STATUSES = ['active', 'paused'];
const BILLING_CYCLES = ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'];

const toDate = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatMysqlDateTime = (value) => {
  const date = toDate(value);
  if (!date) {
    return null;
  }

  return date.toISOString().slice(0, 19).replace('T', ' ');
};

const addDays = (value, days) => {
  const date = toDate(value);
  if (!date) {
    return null;
  }

  const safeDays = Number.isFinite(Number(days)) ? Number(days) : 0;
  date.setUTCDate(date.getUTCDate() + safeDays);
  return date;
};

const calculateSubscriptionTimeline = ({ startDate, endDate, renewalDate, durationDays }) => {
  const normalizedStart = toDate(startDate) || new Date();
  const normalizedEnd = toDate(endDate) || (Number.isFinite(Number(durationDays)) && Number(durationDays) > 0 ? addDays(normalizedStart, durationDays) : null);
  const normalizedRenewal = toDate(renewalDate) || normalizedEnd;

  return {
    startDate: formatMysqlDateTime(normalizedStart),
    endDate: formatMysqlDateTime(normalizedEnd),
    renewalDate: formatMysqlDateTime(normalizedRenewal),
  };
};

const normalizeFeatureList = (features = []) => {
  if (!Array.isArray(features)) {
    return [];
  }

  return [...new Set(features.map((feature) => String(feature).trim()).filter(Boolean))];
};

const parseJson = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

export {
  SUBSCRIPTION_STATUSES,
  CURRENT_SUBSCRIPTION_STATUSES,
  BILLING_CYCLES,
  calculateSubscriptionTimeline,
  formatMysqlDateTime,
  normalizeFeatureList,
  parseJson,
};
