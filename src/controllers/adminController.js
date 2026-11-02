import UserModel from '../models/userModel.js';
import LogModel from '../models/logModel.js';
import { query } from '../config/db.js';
import { asyncHandler } from '../middlewares/errorHandler.js';

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();
  const status = (req.query.status || 'all').trim();
  const { rows, totalCount } = await UserModel.getUsersPaginated({ search, status, limit, offset });
  
  await LogModel.createLog(req.user.id, 'FETCH_USERS', { target: 'all' });

  res.status(200).json({
    success: true,
    count: rows.length,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    data: rows,
  });
});

// @desc    Block or Unblock a user
// @route   PUT /api/admin/users/:id/block
// @access  Private/Admin
const toggleUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body; // boolean

  if (typeof isActive !== 'boolean') {
    const error = new Error('isActive must be a boolean');
    error.statusCode = 400;
    throw error;
  }

  const updatedUser = await UserModel.updateStatus(id, isActive);
  if (!updatedUser) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  await LogModel.createLog(req.user.id, 'UPDATE_USER_STATUS', { 
    targetUserId: id, 
    newStatus: isActive 
  });

  res.status(200).json({
    success: true,
    message: `User ${isActive ? 'unblocked' : 'blocked'} successfully`,
    data: updatedUser,
  });
});

// @desc    Update a user's role
// @route   PATCH /api/admin/users/:id/role
// @access  Private/Admin
const updateUserRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  const normalizedRole = String(role || '').trim().toLowerCase();

  if (!['user', 'admin'].includes(normalizedRole)) {
    const error = new Error('Role must be "user" or "admin"');
    error.statusCode = 400;
    throw error;
  }

  if (req.user.id === id && normalizedRole !== 'admin') {
    const error = new Error('You cannot downgrade your own admin role.');
    error.statusCode = 400;
    throw error;
  }

  const updatedUser = await UserModel.updateRoleById(id, normalizedRole);
  if (!updatedUser) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  await LogModel.createLog(req.user.id, 'UPDATE_USER_ROLE', { targetUserId: id, newRole: normalizedRole });

  res.status(200).json({
    success: true,
    message: 'User role updated successfully',
    data: updatedUser,
  });
});

// @desc    Get all logs
// @route   GET /api/admin/logs
// @access  Private/Admin
const getSystemLogs = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();
  const action = (req.query.action || 'all').trim();
  const fromDate = req.query.fromDate || undefined;
  const toDate = req.query.toDate || undefined;
  const { rows, totalCount } = await LogModel.getLogsPaginated({
    search,
    action,
    fromDate,
    toDate,
    limit,
    offset,
  });

  res.status(200).json({
    success: true,
    count: rows.length,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    data: rows,
  });
});

// @desc    Delete a user (Soft Delete)
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const deletedUser = await UserModel.softDelete(id);
  if (!deletedUser) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  await LogModel.createLog(req.user.id, 'DELETE_USER', { targetUserId: id });

  res.status(200).json({
    success: true,
    message: 'User deleted successfully',
  });
});

// @desc    Get dashboard statistics
// @route   GET /api/admin/dashboard
// @access  Private/Admin
const getDashboardStats = asyncHandler(async (req, res) => {
  const totalUsersRes = await query('SELECT COUNT(*) AS count FROM users WHERE is_deleted = FALSE');
  const activeUsersRes = await query('SELECT COUNT(*) AS count FROM users WHERE is_active = TRUE AND is_deleted = FALSE');
  const totalChatsRes = await query('SELECT COUNT(*) AS count FROM chats');
  const logCountRes = await query('SELECT COUNT(*) AS count FROM logs');

  res.status(200).json({
    success: true,
    data: {
      totalUsers: Number(totalUsersRes[0].count),
      activeUsers: Number(activeUsersRes[0].count),
      totalChats: Number(totalChatsRes[0].count),
      totalLogs: Number(logCountRes[0].count),
    }
  });
});

// @desc    Get dashboard activity summary
// @route   GET /api/admin/activity-summary
// @access  Private/Admin
const getActivitySummary = asyncHandler(async (req, res) => {
  const last24hChats = await query(
    "SELECT COUNT(*) AS count FROM chats WHERE created_at >= NOW() - INTERVAL '1 day'"
  );
  const last24hLogs = await query(
    "SELECT COUNT(*) AS count FROM logs WHERE created_at >= NOW() - INTERVAL '1 day'"
  );
  const topActions = await query(
    `
    SELECT action, COUNT(*) AS count
    FROM logs
    GROUP BY action
    ORDER BY count DESC
    LIMIT 5
    `
  );
  const recentActivity = await query(
    `
    SELECT l.id, l.action, l.created_at, u.email AS user_email
    FROM logs l
    LEFT JOIN users u ON l.user_id = u.id
    ORDER BY l.created_at DESC
    LIMIT 8
    `
  );

  res.status(200).json({
    success: true,
    data: {
      last24hChats: Number(last24hChats[0].count),
      last24hLogs: Number(last24hLogs[0].count),
      topActions,
      recentActivity,
    },
  });
});

// @desc    Get all chats universally
// @route   GET /api/admin/chats
// @access  Private/Admin
const getAllChats = asyncHandler(async (req, res) => {
  const page = Number.parseInt(req.query.page, 10) || 1;
  const limit = Number.parseInt(req.query.limit, 10) || 50;
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, limit)) : 50;
  const offset = (page - 1) * safeLimit;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;
  const search = (req.query.search || '').trim();
  const fromDate = req.query.fromDate || undefined;
  const toDate = req.query.toDate || undefined;

  const where = ['1=1'];
  const params = [];
  if (search) {
    where.push('(u.email LIKE ? OR c.user_message LIKE ? OR c.ai_response LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (fromDate) {
    where.push('c.created_at >= ?');
    params.push(fromDate);
  }
  if (toDate) {
    where.push('c.created_at <= ?');
    params.push(toDate);
  }

  const whereSql = where.join(' AND ');
  const rows = await query(
    `
    SELECT c.*, u.email as user_email
    FROM chats c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE ${whereSql}
    ORDER BY c.created_at DESC
    LIMIT ${safeLimit} OFFSET ${safeOffset}
    `,
    params
  );
  
  const countRes = await query(
    `
    SELECT COUNT(*) AS count
    FROM chats c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE ${whereSql}
    `,
    params
  );
  const totalCount = Number(countRes[0].count);

  res.status(200).json({
    success: true,
    count: rows.length,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    data: rows,
  });
});

export {
  getUsers,
  toggleUserStatus,
  updateUserRole,
  deleteUser,
  getSystemLogs,
  getDashboardStats,
  getActivitySummary,
  getAllChats,
};
