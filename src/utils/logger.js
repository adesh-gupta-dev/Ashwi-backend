import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import winston from 'winston';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Vercel functions have a read-only deployment filesystem. Their logs are
// collected from stdout/stderr, so only create local log files outside Vercel.
const isVercel = process.env.VERCEL === '1';
const logDir = path.join(__dirname, '../../logs');
if (!isVercel && !fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${message}${stack && stack !== message ? `\n${stack}` : ''}`;
});

const transports = [new winston.transports.Console({ format: combine(colorize(), logFormat) })];
if (!isVercel) {
  transports.push(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  );
}

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports,
});

export default logger;
