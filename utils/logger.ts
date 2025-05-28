/**
 * logger.ts
 * Simple logging utility for the application
 */

// Define log levels
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Logger implementation
const logger = {
  debug(message: string, meta?: any): void {
    console.debug(`[DEBUG] ${message}`, meta || '');
  },
  
  info(message: string, meta?: any): void {
    console.info(`[INFO] ${message}`, meta || '');
  },
  
  warn(message: string, meta?: any): void {
    console.warn(`[WARN] ${message}`, meta || '');
  },
  
  error(message: string, meta?: any): void {
    console.error(`[ERROR] ${message}`, meta || '');
  }
};

export default logger; 