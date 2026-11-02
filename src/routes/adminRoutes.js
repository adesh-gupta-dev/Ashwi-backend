import express from 'express';
import {
  getUsers,
  toggleUserStatus,
  updateUserRole,
  getSystemLogs,
  getDashboardStats,
  getActivitySummary,
  deleteUser,
  getAllChats,
} from '../controllers/adminController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { authorizeRoles } from '../middlewares/roleMiddleware.js';

const router = express.Router();

// Apply auth and admin role check to all admin routes
router.use(protect);
router.use(authorizeRoles('admin'));

router.get('/dashboard', getDashboardStats);
router.get('/activity-summary', getActivitySummary);
router.get('/users', getUsers);
router.put('/users/:id/block', toggleUserStatus);
router.patch('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUser);
router.get('/chats', getAllChats);
router.get('/logs', getSystemLogs);

export default router;
