import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { authorizeRoles } from '../middlewares/roleMiddleware.js';
import { validate } from '../middlewares/validationMiddleware.js';
import {
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
} from '../controllers/subscriptionController.js';
import {
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
} from '../validations/subscriptionValidation.js';

const router = express.Router();

router.get('/subscriptions/me', protect, getMySubscription);

router.use('/admin', protect, authorizeRoles('admin'));

router.get('/admin/subscription-plans', validate(subscriptionPlanListQuerySchema, 'query'), getSubscriptionPlans);
router.post('/admin/subscription-plans', validate(createSubscriptionPlanSchema), createSubscriptionPlan);
router.get('/admin/subscription-plans/:id', validate(subscriptionPlanIdParamSchema, 'params'), getSubscriptionPlanById);
router.patch('/admin/subscription-plans/:id', validate(subscriptionPlanIdParamSchema, 'params'), validate(updateSubscriptionPlanSchema), updateSubscriptionPlan);
router.delete('/admin/subscription-plans/:id', validate(subscriptionPlanIdParamSchema, 'params'), deleteSubscriptionPlan);

router.get('/admin/subscriptions', validate(subscriptionListQuerySchema, 'query'), getSubscriptions);
router.post('/admin/subscriptions', validate(createSubscriptionSchema), createSubscription);
router.post('/admin/subscriptions/assign', validate(assignSubscriptionSchema), assignSubscription);
router.get('/admin/subscriptions/:id', validate(subscriptionIdParamSchema, 'params'), getSubscriptionById);
router.patch('/admin/subscriptions/:id/status', validate(subscriptionIdParamSchema, 'params'), validate(updateSubscriptionStatusSchema), updateSubscriptionStatus);
router.patch('/admin/subscriptions/:id', validate(subscriptionIdParamSchema, 'params'), validate(updateSubscriptionSchema), updateSubscription);
router.delete('/admin/subscriptions/:id', validate(subscriptionIdParamSchema, 'params'), deleteSubscription);

export default router;
