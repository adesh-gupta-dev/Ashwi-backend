import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const smtpUser = process.env.SMTP_USER || process.env.SMTP_MAIL;
const smtpPass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const sender = process.env.SMTP_FROM_EMAIL
  ? { name: process.env.SMTP_FROM_NAME || 'Ashwi', address: process.env.SMTP_FROM_EMAIL }
  : process.env.FROM_EMAIL || smtpUser;

const transporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE || undefined,
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templateDir = path.join(__dirname, '..', 'templates', 'email');

const loadTemplate = async (fileName, variables = {}) => {
  const raw = await fs.readFile(path.join(templateDir, fileName), 'utf-8');
  return raw.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '');
};

const sendVerificationEmail = async (to, token) => {
  try {
    if (!smtpUser || !smtpPass) {
      throw new Error('SMTP credentials missing. Set SMTP_USER/SMTP_PASSWORD (or SMTP_MAIL/SMTP_PASS).');
    }

    const publicApiBase = process.env.BACKEND_PUBLIC_URL || process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const url = `${publicApiBase.replace(/\/$/, '')}/api/auth/verify?token=${token}`;
    const html = await loadTemplate('verification.html', { url });

    await transporter.sendMail({
      from: sender,
      to,
      subject: 'Verify your Ashwi account',
      html,
    });
    logger.info(`Verification email sent to ${to}`);
  } catch (error) {
    logger.error(`Error sending email to ${to}: ${error.message}`);
    // Rethrow or handle based on strictness requirements, here we just log it
    // throw new Error('Email sending failed');
  }
};

const sendPasswordResetEmail = async (to, token) => {
  try {
    if (!smtpUser || !smtpPass) {
      throw new Error('SMTP credentials missing. Set SMTP_USER/SMTP_PASSWORD (or SMTP_MAIL/SMTP_PASS).');
    }

    const frontendBase = process.env.NODE_ENV === 'production'
      ? 'https://chatwithashwi.vercel.app'
      : process.env.CLIENT_URL || process.env.FRONTEND_PUBLIC_URL || 'http://localhost:3000';
    const resetUrl = `${frontendBase.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
    const html = await loadTemplate('reset-password.html', { resetUrl, year: new Date().getFullYear() });

    await transporter.sendMail({
      from: sender,
      to,
      subject: 'Reset your Ashwi password',
      html,
      text: `Reset your Ashwi password\n\nWe received a request to reset your password. Open this link to create a new password:\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request this reset, ignore this email. Your password will remain unchanged.\n\nAshwi AI Workspace`,
    });
    logger.info(`Password reset email sent to ${to}`);
  } catch (error) {
    logger.error(`Error sending password reset email to ${to}: ${error.message}`);
  }
};

export { sendVerificationEmail, sendPasswordResetEmail };
