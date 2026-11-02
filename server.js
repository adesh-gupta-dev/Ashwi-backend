import "dotenv/config";
import app from "./src/app.js";
import logger from "./src/utils/logger.js";
import { testDbConnection, databaseTarget } from "./src/config/db.js";
import { describeDatabaseFailure } from "./src/config/databaseDiagnostics.js";
import { initializeDatabase } from "./src/models/initDb.js";

const PORT = process.env.PORT || 3000;
const isVercel = process.env.VERCEL === '1';

const startServer = async () => {
  let isConnected = false;
  try {
    await testDbConnection();
    isConnected = true;
    await initializeDatabase();

    app.listen(PORT, () => {
      logger.info(
        `Server is running in ${process.env.NODE_ENV} mode on port ${PORT}`,
      );
    });
  } catch (error) {
    if (!isConnected) {
      logger.error(describeDatabaseFailure(error, databaseTarget));
    } else {
      logger.error(`Database initialization failed: ${error.message}`, { stack: error.stack });
    }
    process.exit(1);
  }
};

// Vercel imports the Express app as a serverless function. Keep the explicit
// database check and listener for local development only.
if (!isVercel) {
  startServer();

  process.on("unhandledRejection", (err) => {
    logger.error(`Unhandled Rejection: ${err.message}`, { stack: err.stack });
    process.exit(1);
  });

  process.on("uncaughtException", (err) => {
    logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack });
    process.exit(1);
  });
}

export default app;
