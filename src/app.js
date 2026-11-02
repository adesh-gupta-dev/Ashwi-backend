import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import logger from './utils/logger.js';
import { errorHandler } from './middlewares/errorHandler.js';
import apiLimiter from './middlewares/rateLimiter.js';
import authRoutes from './routes/authRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import { initializeDatabase } from './models/initDb.js';

const app = express();
const allowedOrigins = [
  'https://chatwithashwi.vercel.app',
  'https://ashwifontend.vercel.app',
  process.env.CORS_ORIGIN,
  process.env.FRONTEND_PUBLIC_URL,
  process.env.FRONTEND_ORIGIN,
  process.env.FRONTEND_URL,
]
  .flatMap((value) => (value || '').split(','))
  .map((origin) => origin.trim())
  .filter(Boolean);

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesOriginPattern(origin, pattern) {
  if (pattern === '*') {
    return true;
  }

  if (!pattern.includes('*')) {
    return origin === pattern;
  }

  const regex = new RegExp(`^${escapeForRegExp(pattern).replace(/\\\*/g, '.*')}$`);
  return regex.test(origin);
}

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.length === 0) {
    return process.env.NODE_ENV !== 'production';
  }

  return allowedOrigins.some((pattern) => matchesOriginPattern(origin, pattern));
}

const corsOptions = {
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Security Middlewares
app.use(helmet());
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP Request Logging
morgan.token('safe-url', req => req.path.startsWith('/api/auth') ? req.originalUrl.split('?')[0] : req.originalUrl);
app.use(
  morgan(':remote-addr :method :safe-url :status :res[content-length] - :response-time ms', {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  }),
);

// Basic health-check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

let databaseInitialization;
app.use('/api', async (req, res, next) => {
  // Provider configuration is public and independent of PostgreSQL. Let the
  // auth screen load even while the database is unavailable.
  if (process.env.VERCEL !== '1' || req.path === '/auth/oauth/providers') return next();

  if (!databaseInitialization) {
    databaseInitialization = initializeDatabase().catch((error) => {
      databaseInitialization = undefined;
      throw error;
    });
  }

  try {
    await databaseInitialization;
    next();
  } catch (error) {
    logger.error('Vercel database initialization failed', { message: error.message, code: error.code });
    res.status(503).json({ success: false, error: 'Ashwi is temporarily unavailable. Please try again shortly.' });
  }
});

// Rate Limiting
app.use('/api/', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', subscriptionRoutes);

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({ error: 'Route not found' });
});

// Centralized Error Handler
app.use(errorHandler);

export default app;
