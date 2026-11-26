import winston from 'winston';
import path from 'path';

// PC_LOG_DIR enables file logging in any mode (desktop sets it to the user data dir)
const logDir = process.env.PC_LOG_DIR || path.join(process.cwd(), 'logs');

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

if (process.env.PC_LOG_DIR || process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: path.join(logDir, 'app.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 7,
    })
  );
}

export default logger;
