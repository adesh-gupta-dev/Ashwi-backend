import UserModel from '../models/userModel.js';
import LogModel from '../models/logModel.js';
import SubscriptionModel from '../models/subscriptionModel.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import {
  calculateSubscriptionTimeline,
  normalizeFeatureList,
  CURRENT_SUBSCRIPTION_STATUSES,
} from '../utils/subscriptionUtils.js';

const sendPaginatedResponse = (res, rows, totalCount, page, limit) => {
  res.status(200).json({
    success: true,
    count: rows.length,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    data: rows,
  });
};

const buildPlanPayload = (body) => ({
  name: body.name?.trim(),
  description: body.description?.trim() || null,
  price: body.price,
  billing_cycle: body.billingCycle,
  duration_days: body.durationDays,
  features: normalizeFeatureList(body.features || []),
  is_active: body.isActive ?? true,
});

const buildSubscriptionPayload = ({ body, plan, user, existingSubscription = null }) => {
  const status = (body.status || existingSubscription?.status || 'active').trim().toLowerCase();
  const timeline = calculateSubscriptionTimeline({
    startDate: body.startDate || existingSubscription?.start_date,
    endDate: body.endDate || existingSubscription?.end_date,
    renewalDate: body.renewalDate || existingSubscription?.renewal_date,
    durationDays: plan.duration_days,
  });

  return {
    user_id: user.id,
    plan_id: plan.id,
    status,
    start_date: timeline.startDate,
    end_date: timeline.endDate,
    renewal_date: timeline.renewalDate,
    auto_renew: body.autoRenew ?? existingSubscription?.auto_renew ?? false,
    notes: body.notes !== undefined ? (body.notes || null) : existingSubscription?.notes || null,
    plan_name: plan.name,
    plan_price: plan.price,
    plan_duration_days: plan.duration_days,
    billing_cycle: plan.billing_cycle,
  };
};

const ensureUserExists = async (userId) => {
  const user = await UserModel.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  if (!user.is_active) {
    const error = new Error('User account is inactive');
    error.statusCode = 400;
    throw error;
  }

  return user;
};

const ensurePlanIsAssignable = async (planId) => {
  const plan = await SubscriptionModel.findPlanById(planId);
  if (!plan) {
    const error = new Error('Subscription plan not found');
    error.statusCode = 404;
    throw error;
  }

  if (!plan.is_active) {
    const error = new Error('Subscription plan is inactive');
    error.statusCode = 400;
    throw error;
  }

  return plan;
};

const ensureNoCurrentSubscriptionConflict = async (userId, excludeSubscriptionId = null) => {
  const conflictCount = await SubscriptionModel.countCurrentSubscriptionsForUser(userId, excludeSubscriptionId);
  if (conflictCount > 0) {
    const error = new Error('User already has an active or paused subscription');
    error.statusCode = 409;
    throw error;
  }
};

// @desc    Get the current authenticated user's active subscription and history
// @route   GET /api/subscriptions/me
// @access  Private
const getMySubscription = asyncHandler(async (req, res) => {
  const [activeSubscription, history] = await Promise.all([
    SubscriptionModel.getCurrentSubscriptionForUser(req.user.id),
    SubscriptionModel.getSubscriptionHistoryByUser(req.user.id),
  ]);

  res.status(200).json({
    success: true,
    message: 'Subscription details fetched successfully',
    count: history.length,
    data: {
      activeSubscription,
      history,
    },
  });
});

// --------------------
// Admin plan actions
// --------------------

// @desc    Get all subscription plans
// @route   GET /api/admin/subscription-plans
// @access  Private/Admin
const getSubscriptionPlans = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();
  const isActive = req.query.isActive || 'all';

  const { rows, totalCount } = await SubscriptionModel.getPlansPaginated({
    search,
    isActive,
    limit,
    offset,
  });

  sendPaginatedResponse(res, rows, totalCount, page, limit);
});

// @desc    Create subscription plan
// @route   POST /api/admin/subscription-plans
// @access  Private/Admin
const createSubscriptionPlan = asyncHandler(async (req, res) => {
  const payload = buildPlanPayload(req.body);

  const existingPlan = await SubscriptionModel.findPlanByName(payload.name);
  if (existingPlan) {
    const error = new Error('Subscription plan name already exists');
    error.statusCode = 409;
    throw error;
  }

  const createdPlan = await SubscriptionModel.createPlan(payload);

  await LogModel.createLog(req.user.id, 'CREATE_SUBSCRIPTION_PLAN', {
    planId: createdPlan.id,
    name: createdPlan.name,
  });

  res.status(201).json({
    success: true,
    message: 'Subscription plan created successfully',
    data: createdPlan,
  });
});

// @desc    Get subscription plan by id
// @route   GET /api/admin/subscription-plans/:id
// @access  Private/Admin
const getSubscriptionPlanById = asyncHandler(async (req, res) => {
  const plan = await SubscriptionModel.findPlanById(req.params.id, true);
  if (!plan) {
    const error = new Error('Subscription plan not found');
    error.statusCode = 404;
    throw error;
  }

  res.status(200).json({
    success: true,
    data: plan,
  });
});

// @desc    Update subscription plan
// @route   PATCH /api/admin/subscription-plans/:id
// @access  Private/Admin
const updateSubscriptionPlan = asyncHandler(async (req, res) => {
  const existingPlan = await SubscriptionModel.findPlanById(req.params.id, true);
  if (!existingPlan || existingPlan.is_deleted) {
    const error = new Error('Subscription plan not found');
    error.statusCode = 404;
    throw error;
  }

  const updates = {};

  if (req.body.name !== undefined) {
    const normalizedName = req.body.name.trim();
    const duplicatePlan = await SubscriptionModel.findPlanByName(normalizedName);
    if (duplicatePlan && duplicatePlan.id !== existingPlan.id) {
      const error = new Error('Subscription plan name already exists');
      error.statusCode = 409;
      throw error;
    }
    updates.name = normalizedName;
  }

  if (req.body.description !== undefined) {
    updates.description = req.body.description.trim() || null;
  }

  if (req.body.price !== undefined) {
    updates.price = req.body.price;
  }

  if (req.body.billingCycle !== undefined) {
    updates.billing_cycle = req.body.billingCycle;
  }

  if (req.body.durationDays !== undefined) {
    updates.duration_days = req.body.durationDays;
  }

  if (req.body.features !== undefined) {
    updates.features = JSON.stringify(normalizeFeatureList(req.body.features));
  }

  if (req.body.isActive !== undefined) {
    updates.is_active = req.body.isActive;
  }

  const updatedPlan = await SubscriptionModel.updatePlanById(existingPlan.id, updates);

  await LogModel.createLog(req.user.id, 'UPDATE_SUBSCRIPTION_PLAN', {
    planId: existingPlan.id,
    updatedFields: Object.keys(updates),
  });

  res.status(200).json({
    success: true,
    message: 'Subscription plan updated successfully',
    data: updatedPlan,
  });
});

// @desc    Delete subscription plan
// @route   DELETE /api/admin/subscription-plans/:id
// @access  Private/Admin
const deleteSubscriptionPlan = asyncHandler(async (req, res) => {
  const existingPlan = await SubscriptionModel.findPlanById(req.params.id, true);
  if (!existingPlan || existingPlan.is_deleted) {
    const error = new Error('Subscription plan not found');
    error.statusCode = 404;
    throw error;
  }

  const deletedPlan = await SubscriptionModel.softDeletePlan(existingPlan.id);

  await LogModel.createLog(req.user.id, 'DELETE_SUBSCRIPTION_PLAN', {
    planId: existingPlan.id,
    name: existingPlan.name,
  });

  res.status(200).json({
    success: true,
    message: 'Subscription plan deleted successfully',
    data: deletedPlan,
  });
});

// --------------------
// Admin subscription actions
// --------------------

// @desc    Get all subscriptions
// @route   GET /api/admin/subscriptions
// @access  Private/Admin
const getSubscriptions = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();
  const status = req.query.status || 'all';
  const planId = req.query.planId || 'all';
  const userId = req.query.userId || 'all';
  const fromDate = req.query.fromDate || undefined;
  const toDate = req.query.toDate || undefined;

  const { rows, totalCount } = await SubscriptionModel.getSubscriptionsPaginated({
    search,
    status,
    planId,
    userId,
    fromDate,
    toDate,
    limit,
    offset,
  });

  sendPaginatedResponse(res, rows, totalCount, page, limit);
});

// @desc    Create a subscription
// @route   POST /api/admin/subscriptions
// @access  Private/Admin
const createSubscription = asyncHandler(async (req, res) => {
  const user = await ensureUserExists(req.body.userId);
  const plan = await ensurePlanIsAssignable(req.body.planId);
  const status = req.body.status || 'active';

  if (CURRENT_SUBSCRIPTION_STATUSES.includes(status)) {
    await ensureNoCurrentSubscriptionConflict(user.id);
  }

  const payload = buildSubscriptionPayload({
    body: req.body,
    plan,
    user,
  });

  const createdSubscription = await SubscriptionModel.createSubscription(payload);

  await LogModel.createLog(req.user.id, 'CREATE_SUBSCRIPTION', {
    subscriptionId: createdSubscription.id,
    targetUserId: user.id,
    planId: plan.id,
    status: createdSubscription.status,
  });

  res.status(201).json({
    success: true,
    message: 'Subscription created successfully',
    data: createdSubscription,
  });
});

// @desc    Assign a plan to a user
// @route   POST /api/admin/subscriptions/assign
// @access  Private/Admin
const assignSubscription = asyncHandler(async (req, res) => {
  const user = await ensureUserExists(req.body.userId);
  const plan = await ensurePlanIsAssignable(req.body.planId);
  const status = req.body.status || 'active';

  if (CURRENT_SUBSCRIPTION_STATUSES.includes(status)) {
    await ensureNoCurrentSubscriptionConflict(user.id);
  }

  const payload = buildSubscriptionPayload({
    body: {
      ...req.body,
      status,
    },
    plan,
    user,
  });

  const assignedSubscription = await SubscriptionModel.createSubscription(payload);

  await LogModel.createLog(req.user.id, 'ASSIGN_SUBSCRIPTION', {
    subscriptionId: assignedSubscription.id,
    targetUserId: user.id,
    planId: plan.id,
    status: assignedSubscription.status,
  });

  res.status(201).json({
    success: true,
    message: 'Subscription assigned successfully',
    data: assignedSubscription,
  });
});

// @desc    Get subscription by id
// @route   GET /api/admin/subscriptions/:id
// @access  Private/Admin
const getSubscriptionById = asyncHandler(async (req, res) => {
  const subscription = await SubscriptionModel.findSubscriptionById(req.params.id, true);
  if (!subscription) {
    const error = new Error('Subscription not found');
    error.statusCode = 404;
    throw error;
  }

  res.status(200).json({
    success: true,
    data: subscription,
  });
});

// @desc    Update subscription
// @route   PATCH /api/admin/subscriptions/:id
// @access  Private/Admin
const updateSubscription = asyncHandler(async (req, res) => {
  const existingSubscription = await SubscriptionModel.findSubscriptionById(req.params.id, true);
  if (!existingSubscription || existingSubscription.is_deleted) {
    const error = new Error('Subscription not found');
    error.statusCode = 404;
    throw error;
  }

  const updates = {};
  let plan = null;

  if (req.body.planId !== undefined) {
    plan = await ensurePlanIsAssignable(req.body.planId);
  } else {
    plan = {
      id: existingSubscription.plan_id,
      name: existingSubscription.plan_name,
      price: existingSubscription.plan_price,
      duration_days: existingSubscription.plan_duration_days,
      billing_cycle: existingSubscription.billing_cycle,
    };
  }

  if (req.body.status !== undefined) {
    updates.status = req.body.status;
  }

  if (req.body.autoRenew !== undefined) {
    updates.auto_renew = req.body.autoRenew;
  }

  if (req.body.notes !== undefined) {
    updates.notes = req.body.notes || null;
  }

  const derivedBody = {
    ...req.body,
    status: req.body.status || existingSubscription.status,
  };

  const payload = buildSubscriptionPayload({
    body: derivedBody,
    plan,
    user: { id: existingSubscription.user_id },
    existingSubscription,
  });

  updates.plan_id = plan.id;
  updates.plan_name = payload.plan_name;
  updates.plan_price = payload.plan_price;
  updates.plan_duration_days = payload.plan_duration_days;
  updates.billing_cycle = payload.billing_cycle;

  if (req.body.startDate !== undefined) {
    updates.start_date = payload.start_date;
  }

  if (req.body.endDate !== undefined) {
    updates.end_date = payload.end_date;
  }

  if (req.body.renewalDate !== undefined) {
    updates.renewal_date = payload.renewal_date;
  }

  if (updates.status && CURRENT_SUBSCRIPTION_STATUSES.includes(updates.status)) {
    await ensureNoCurrentSubscriptionConflict(existingSubscription.user_id, existingSubscription.id);
  }

  const updatedSubscription = await SubscriptionModel.updateSubscriptionById(existingSubscription.id, updates);

  await LogModel.createLog(req.user.id, 'UPDATE_SUBSCRIPTION', {
    subscriptionId: existingSubscription.id,
    targetUserId: existingSubscription.user_id,
    updatedFields: Object.keys(updates),
  });

  res.status(200).json({
    success: true,
    message: 'Subscription updated successfully',
    data: updatedSubscription,
  });
});

// @desc    Update subscription status
// @route   PATCH /api/admin/subscriptions/:id/status
// @access  Private/Admin
const updateSubscriptionStatus = asyncHandler(async (req, res) => {
  const existingSubscription = await SubscriptionModel.findSubscriptionById(req.params.id, true);
  if (!existingSubscription || existingSubscription.is_deleted) {
    const error = new Error('Subscription not found');
    error.statusCode = 404;
    throw error;
  }

  if (CURRENT_SUBSCRIPTION_STATUSES.includes(req.body.status)) {
    await ensureNoCurrentSubscriptionConflict(existingSubscription.user_id, existingSubscription.id);
  }

  const updatedSubscription = await SubscriptionModel.updateSubscriptionById(existingSubscription.id, {
    status: req.body.status,
  });

  if (req.body.notes !== undefined) {
    await SubscriptionModel.updateSubscriptionById(existingSubscription.id, {
      notes: req.body.notes || null,
    });
    updatedSubscription.notes = req.body.notes || null;
  }

  await LogModel.createLog(req.user.id, 'UPDATE_SUBSCRIPTION_STATUS', {
    subscriptionId: existingSubscription.id,
    targetUserId: existingSubscription.user_id,
    previousStatus: existingSubscription.status,
    nextStatus: req.body.status,
  });

  res.status(200).json({
    success: true,
    message: 'Subscription status updated successfully',
    data: updatedSubscription,
  });
});

// @desc    Delete subscription
// @route   DELETE /api/admin/subscriptions/:id
// @access  Private/Admin
const deleteSubscription = asyncHandler(async (req, res) => {
  const existingSubscription = await SubscriptionModel.findSubscriptionById(req.params.id, true);
  if (!existingSubscription || existingSubscription.is_deleted) {
    const error = new Error('Subscription not found');
    error.statusCode = 404;
    throw error;
  }

  const deletedSubscription = await SubscriptionModel.softDeleteSubscription(existingSubscription.id);

  await LogModel.createLog(req.user.id, 'DELETE_SUBSCRIPTION', {
    subscriptionId: existingSubscription.id,
    targetUserId: existingSubscription.user_id,
    planId: existingSubscription.plan_id,
  });

  res.status(200).json({
    success: true,
    message: 'Subscription deleted successfully',
    data: deletedSubscription,
  });
});

export {
  getMySubscription,
  getSubscriptionPlans,
  createSubscriptionPlan,
  getSubscriptionPlanById,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  getSubscriptions,
  createSubscription,
  assignSubscription,
  getSubscriptionById,
  updateSubscription,
  updateSubscriptionStatus,
  deleteSubscription,
};
