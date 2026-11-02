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
const configuredOrigins = [
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

const allowedDomains = [...new Set(configuredOrigins.map((value) => {
  const normalized = value.replace(/^\*\./, '').toLowerCase();
  try {
    const withProtocol = normalized.includes('://') ? normalized : `https://${normalized}`;
    return new URL(withProtocol).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}).filter(Boolean))];

const corsOptions = {
  credentials: true,
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    try {
      const hostname = new URL(origin).hostname.replace(/^www\./, '').toLowerCase();
      const isAllowed = allowedDomains.some((domain) => {
        const cleanDomain = domain.replace(/^www\./, '').toLowerCase();
        return hostname === cleanDomain || hostname.endsWith(`.${cleanDomain}`);
      });

      if (isAllowed) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    } catch (error) {
      return callback(new Error('Invalid origin'));
    }
  },
};

// Security Middlewares
app.use(helmet());
app.use(cors(corsOptions));

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
