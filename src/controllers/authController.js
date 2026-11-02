import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import Joi from 'joi';
import UserModel from '../models/userModel.js';
import LogModel from '../models/logModel.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { generateToken } from '../utils/jwtUtils.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/emailService.js';

// Validator definitions
const signupSchema = Joi.object({
  name: Joi.string().min(2).max(120).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().min(10).required(),
  password: Joi.string().min(8).required(),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
});

const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(120).required(),
});

// @desc    Register a new user
// @route   POST /api/auth/signup
// @access  Public
const signup = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const normalizedEmail = email.trim().toLowerCase();

  // Check if user exists
  const existingUser = await UserModel.findByEmail(normalizedEmail);
  if (existingUser) {
    const error = new Error('User already exists');
    error.statusCode = 400;
    throw error;
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  // Generate verification token
  const verificationToken = crypto.randomBytes(20).toString('hex');

  // Create user with default role 'user'
  const user = await UserModel.create({
    name,
    email: normalizedEmail,
    passwordHash,
    role: 'user', // strictly enforce normal user creation from public endpoint
    verificationToken,
  });

  // Send verification email
  await sendVerificationEmail(normalizedEmail, verificationToken);
  await LogModel.createLog(user.id, 'USER_SIGNUP', { email: normalizedEmail, name: user.name });

  res.status(201).json({
    success: true,
    message: 'User registered successfully. Please check your email to verify your account.',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

// @desc    Verify user email
// @route   GET /api/auth/verify?token=
// @access  Public
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.query;
  const frontendBase = (process.env.NODE_ENV === 'production'
    ? 'https://chatwithashwi.vercel.app'
    : process.env.CLIENT_URL || process.env.FRONTEND_PUBLIC_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const redirect = (status) => res.redirect(303, `${frontendBase}/verify-email?status=${status}`);

  if (typeof token !== 'string' || !token) return redirect('invalid');

  const user = await UserModel.verifyEmail(token);

  if (!user) return redirect('invalid');

  await LogModel.createLog(user.id, 'EMAIL_VERIFIED', { email: user.email });

  return redirect('success');
});

// @desc    Resend verification email for logged-in user
// @route   POST /api/auth/resend-verification
// @access  Private
const resendVerification = asyncHandler(async (req, res) => {
  const user = await UserModel.findById(req.user.id);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  if (user.is_verified) {
    res.status(200).json({
      success: true,
      message: 'Your email is already verified.',
    });
    return;
  }

  const verificationToken = crypto.randomBytes(20).toString('hex');
  await UserModel.setVerificationTokenById(user.id, verificationToken);
  await sendVerificationEmail(user.email, verificationToken);
  await LogModel.createLog(user.id, 'VERIFICATION_RESENT', { email: user.email });

  res.status(200).json({
    success: true,
    message: 'Verification email sent. Please check your inbox.',
  });
});

// @desc    Send password reset email
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = email.trim().toLowerCase();

  const user = await UserModel.findByEmail(normalizedEmail);
  if (user) {
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await UserModel.setResetTokenByEmail(normalizedEmail, resetToken, expiresAt);
    await sendPasswordResetEmail(normalizedEmail, resetToken);
    await LogModel.createLog(user.id, 'PASSWORD_RESET_REQUESTED', { email: normalizedEmail });
  }

  res.status(200).json({
    success: true,
    message: 'If your email exists in our system, you will receive a password reset link shortly.',
  });
});

// @desc    Reset password using token
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const user = await UserModel.findByResetToken(token);
  if (!user) {
    const error = new Error('Invalid or expired reset token.');
    error.statusCode = 400;
    throw error;
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);
  await UserModel.updatePasswordById(user.id, passwordHash);
  await LogModel.createLog(user.id, 'PASSWORD_RESET_COMPLETED', { email: user.email });

  res.status(200).json({
    success: true,
    message: 'Password updated successfully. Please log in with your new password.',
  });
});

// @desc    Change password for logged-in user
// @route   POST /api/auth/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await UserModel.findByEmail(req.user.email);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  if (!user.password_hash) return res.status(400).json({ error: 'Use Forgot password to set a password for your social sign-in account.' });
  const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isMatch) {
    const error = new Error('Current password is incorrect.');
    error.statusCode = 400;
    throw error;
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(newPassword, salt);
  await UserModel.updatePasswordById(user.id, passwordHash);
  await LogModel.createLog(user.id, 'PASSWORD_CHANGED', { email: user.email });

  res.status(200).json({
    success: true,
    message: 'Password updated successfully.',
  });
});

// @desc    Update profile (name)
// @route   PATCH /api/auth/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const updated = await UserModel.updateNameById(req.user.id, name.trim());
  if (!updated) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  await LogModel.createLog(req.user.id, 'PROFILE_UPDATED', { name: updated.name });

  res.status(200).json({
    success: true,
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      isVerified: updated.is_verified,
    },
  });
});

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = email.trim().toLowerCase();

  // Find user
  const user = await UserModel.findByEmail(normalizedEmail);
  if (!user) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  // Check if blocked or unverified
  if (!user.is_active) {
    const error = new Error('Account is blocked. Contact support.');
    error.statusCode = 403;
    throw error;
  }
  
  // Verify password
  const isMatch = user.password_hash ? await bcrypt.compare(password, user.password_hash) : false;
  if (!isMatch) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  // Generate JWT token
  const token = generateToken({
    id: user.id,
    role: user.role,
    email: user.email,
  });

  await LogModel.createLog(user.id, 'USER_LOGIN', { email: user.email });

  res.status(200).json({
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isVerified: user.is_verified,
    },
  });
});

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const user = await UserModel.findById(req.user.id);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  res.status(200).json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isVerified: user.is_verified,
    },
  });
});

export {
  signup,
  verifyEmail,
  resendVerification,
  login,
  getMe,
  forgotPassword,
  resetPassword,
  changePassword,
  updateProfile,
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
};
