import 'dotenv/config';
import { pool, testDbConnection, databaseTarget } from '../src/config/db.js';
import { describeDatabaseFailure } from '../src/config/databaseDiagnostics.js';
import logger from '../src/utils/logger.js';

try {
  await testDbConnection();
  logger.info(`Database ready: ${databaseTarget.host}:${databaseTarget.port}/${databaseTarget.database}`);
} catch (error) {
  logger.error(describeDatabaseFailure(error, databaseTarget));
  process.exitCode = 1;
} finally {
  await pool.end();
}
