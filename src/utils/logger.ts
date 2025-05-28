/**
 * logger.ts
 * Simple logger utility for the application
 */

// Log levels
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private _level: LogLevel = 'info';

  constructor() {
    // Check for environment setting
    if (process.env.LOG_LEVEL) {
      this.setLevel(process.env.LOG_LEVEL as LogLevel);
    }
  }

  /**
   * Set the minimum log level to display
   * @param level The minimum level to log
   */
  setLevel(level: LogLevel): void {
    this._level = level;
  }

  /**
   * Get numeric value for log level (for comparison)
   * @private
   */
  private getLevelValue(level: LogLevel): number {
    switch (level) {
      case 'debug':
        return 0;
      case 'info':
        return 1;
      case 'warn':
        return 2;
      case 'error':
        return 3;
      default:
        return 1; // Default to info
    }
  }

  /**
   * Check if a message should be logged based on current level
   * @private
   */
  private shouldLog(level: LogLevel): boolean {
    return this.getLevelValue(level) >= this.getLevelValue(this._level);
  }

  /**
   * Format timestamp for log messages
   * @private
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Log a debug message
   * @param message The message to log
   * @param meta Optional metadata to include
   */
  debug(message: string, meta?: any): void {
    if (this.shouldLog('debug')) {
      console.debug(`[${this.getTimestamp()}] [DEBUG] ${message}`, meta ? meta : '');
    }
  }

  /**
   * Log an informational message
   * @param message The message to log
   * @param meta Optional metadata to include
   */
  info(message: string, meta?: any): void {
    if (this.shouldLog('info')) {
      console.info(`[${this.getTimestamp()}] [INFO] ${message}`, meta ? meta : '');
    }
  }

  /**
   * Log a warning message
   * @param message The message to log
   * @param meta Optional metadata to include
   */
  warn(message: string, meta?: any): void {
    if (this.shouldLog('warn')) {
      console.warn(`[${this.getTimestamp()}] [WARN] ${message}`, meta ? meta : '');
    }
  }

  /**
   * Log an error message
   * @param message The message to log
   * @param meta Optional error object or metadata
   */
  error(message: string, meta?: any): void {
    if (this.shouldLog('error')) {
      console.error(`[${this.getTimestamp()}] [ERROR] ${message}`, meta ? meta : '');
    }
  }
}

export default new Logger();
