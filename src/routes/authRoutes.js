import express from 'express';
import {
  signup,
  login,
  verifyEmail,
  resendVerification,
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
} from '../controllers/authController.js';
import { validate } from '../middlewares/validationMiddleware.js';
import { protect } from '../middlewares/authMiddleware.js';
import { oauthHandlers } from '../controllers/oauthController.js';

const router = express.Router();
router.get('/oauth/providers', oauthHandlers.providers);
router.get('/oauth/linked', protect, oauthHandlers.linked);
router.post('/oauth/exchange', oauthHandlers.exchange);
router.post('/oauth/:provider/start', oauthHandlers.start);
router.post('/oauth/:provider/link', protect, oauthHandlers.start);
router.get('/oauth/:provider/callback', oauthHandlers.callback);

router.post('/signup', validate(signupSchema), signup);
router.post('/login', validate(loginSchema), login);
router.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);
router.get('/verify', verifyEmail);
router.post('/resend-verification', protect, resendVerification);
router.get('/me', protect, getMe);
router.post('/change-password', protect, validate(changePasswordSchema), changePassword);
router.patch('/profile', protect, validate(updateProfileSchema), updateProfile);

export default router;
