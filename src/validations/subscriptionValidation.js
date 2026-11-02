import Joi from 'joi';
import {
  BILLING_CYCLES,
  SUBSCRIPTION_STATUSES,
} from '../utils/subscriptionUtils.js';

const basePaginationSchema = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().allow('').optional(),
};

const subscriptionPlanIdParamSchema = Joi.object({
  id: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

const subscriptionIdParamSchema = Joi.object({
  id: Joi.string().uuid({ version: 'uuidv4' }).required(),
});

const subscriptionPlanListQuerySchema = Joi.object({
  ...basePaginationSchema,
  isActive: Joi.string().trim().valid('all', 'true', 'false').default('all'),
});

const subscriptionListQuerySchema = Joi.object({
  ...basePaginationSchema,
  status: Joi.string().trim().lowercase().valid('all', ...SUBSCRIPTION_STATUSES).default('all'),
  userId: Joi.string().uuid({ version: 'uuidv4' }).allow('', 'all').default('all'),
  planId: Joi.string().uuid({ version: 'uuidv4' }).allow('', 'all').default('all'),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().optional(),
});

const createSubscriptionPlanSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  description: Joi.string().trim().max(2000).allow('').optional(),
  price: Joi.number().precision(2).min(0).required(),
  billingCycle: Joi.string().trim().lowercase().valid(...BILLING_CYCLES).required(),
  durationDays: Joi.number().integer().min(1).required(),
  features: Joi.array().items(Joi.string().trim().min(1).max(120)).default([]),
  isActive: Joi.boolean().default(true),
});

const updateSubscriptionPlanSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).optional(),
  description: Joi.string().trim().max(2000).allow('').optional(),
  price: Joi.number().precision(2).min(0).optional(),
  billingCycle: Joi.string().trim().lowercase().valid(...BILLING_CYCLES).optional(),
  durationDays: Joi.number().integer().min(1).optional(),
  features: Joi.array().items(Joi.string().trim().min(1).max(120)).optional(),
  isActive: Joi.boolean().optional(),
}).min(1);

const createSubscriptionSchema = Joi.object({
  userId: Joi.string().uuid({ version: 'uuidv4' }).required(),
  planId: Joi.string().uuid({ version: 'uuidv4' }).required(),
  status: Joi.string().trim().lowercase().valid(...SUBSCRIPTION_STATUSES).default('active'),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  renewalDate: Joi.date().iso().optional(),
  autoRenew: Joi.boolean().default(false),
  notes: Joi.string().trim().max(2000).allow('').optional(),
});

const updateSubscriptionSchema = Joi.object({
  planId: Joi.string().uuid({ version: 'uuidv4' }).optional(),
  status: Joi.string().trim().lowercase().valid(...SUBSCRIPTION_STATUSES).optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  renewalDate: Joi.date().iso().optional(),
  autoRenew: Joi.boolean().optional(),
  notes: Joi.string().trim().max(2000).allow('').optional(),
}).min(1);

const updateSubscriptionStatusSchema = Joi.object({
  status: Joi.string().trim().lowercase().valid(...SUBSCRIPTION_STATUSES).required(),
  notes: Joi.string().trim().max(2000).allow('').optional(),
});

const assignSubscriptionSchema = Joi.object({
  userId: Joi.string().uuid({ version: 'uuidv4' }).required(),
  planId: Joi.string().uuid({ version: 'uuidv4' }).required(),
  status: Joi.string().trim().lowercase().valid(...SUBSCRIPTION_STATUSES).default('active'),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  renewalDate: Joi.date().iso().optional(),
  autoRenew: Joi.boolean().default(false),
  notes: Joi.string().trim().max(2000).allow('').optional(),
});

export {
  subscriptionPlanIdParamSchema,
  subscriptionIdParamSchema,
  subscriptionPlanListQuerySchema,
  subscriptionListQuerySchema,
  createSubscriptionPlanSchema,
  updateSubscriptionPlanSchema,
  createSubscriptionSchema,
  updateSubscriptionSchema,
  updateSubscriptionStatusSchema,
  assignSubscriptionSchema,
};
