/**
 * token-storage.service.ts
 * Service for securely storing and retrieving API tokens
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import logger from './logger';
import config from '../config/config';

// Key for encrypting/decrypting tokens
// In production, this should be a environment variable or key management service
const ENCRYPTION_KEY = config.JWT_SECRET.slice(0, 32);
const ENCRYPTION_IV_LENGTH = 16;

// Storage location
const TOKENS_DIR = path.join(process.cwd(), '.tokens');

/**
 * Ensures the tokens directory exists
 */
const ensureTokensDirectory = () => {
  if (!fs.existsSync(TOKENS_DIR)) {
    try {
      fs.mkdirSync(TOKENS_DIR, { recursive: true });
      fs.chmodSync(TOKENS_DIR, 0o700); // Only owner can read/write/execute
      logger.debug('Created tokens directory at:', TOKENS_DIR);
    } catch (error) {
      logger.error(
        'Failed to create tokens directory:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
};

/**
 * Encrypts a string using AES-256-CBC
 * @param text Text to encrypt
 * @returns Encrypted string and IV as base64
 */
const encrypt = (text: string): string => {
  try {
    const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);

    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Return IV and encrypted content as combined base64 string
    return `${iv.toString('base64')}:${encrypted}`;
  } catch (error) {
    logger.error('Encryption error:', error instanceof Error ? error.message : String(error));
    throw new Error('Failed to encrypt token');
  }
};

/**
 * Decrypts an AES-256-CBC encrypted string
 * @param text Encrypted string with IV in format IV:encryptedData
 * @returns Decrypted string
 */
const decrypt = (text: string): string => {
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'base64');
    const encryptedText = parts[1];

    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);

    let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    logger.error('Decryption error:', error instanceof Error ? error.message : String(error));
    throw new Error('Failed to decrypt token');
  }
};

/**
 * Saves a token to storage with encryption
 * @param key Unique identifier for the token (e.g., 'shopify_mystore.com')
 * @param token The token to store
 */
const saveToken = async (key: string, token: string): Promise<void> => {
  try {
    ensureTokensDirectory();

    // Encrypt the token
    const encryptedToken = encrypt(token);

    // Save to file
    const tokenPath = path.join(TOKENS_DIR, `${key}.token`);
    fs.writeFileSync(tokenPath, encryptedToken);
    fs.chmodSync(tokenPath, 0o600); // Only owner can read/write

    logger.debug(`Token saved for key: ${key}`);
  } catch (error) {
    logger.error(
      `Failed to save token for key ${key}:`,
      error instanceof Error ? error.message : String(error)
    );
    throw new Error(
      `Failed to save token: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * Retrieves a token from storage with decryption
 * @param key Unique identifier for the token (e.g., 'shopify_mystore.com')
 * @returns The decrypted token or undefined if not found
 */
const getToken = async (key: string): Promise<string | undefined> => {
  try {
    ensureTokensDirectory();

    const tokenPath = path.join(TOKENS_DIR, `${key}.token`);

    // Check if token file exists
    if (!fs.existsSync(tokenPath)) {
      logger.debug(`No token found for key: ${key}`);
      return undefined;
    }

    // Read and decrypt the token
    const encryptedToken = fs.readFileSync(tokenPath, 'utf8');
    const token = decrypt(encryptedToken);

    logger.debug(`Token retrieved for key: ${key}`);
    return token;
  } catch (error) {
    logger.error(
      `Failed to retrieve token for key ${key}:`,
      error instanceof Error ? error.message : String(error)
    );
    return undefined;
  }
};

/**
 * Deletes a token from storage
 * @param key Unique identifier for the token (e.g., 'shopify_mystore.com')
 * @returns True if deletion was successful, false otherwise
 */
const deleteToken = async (key: string): Promise<boolean> => {
  try {
    ensureTokensDirectory();

    const tokenPath = path.join(TOKENS_DIR, `${key}.token`);

    // Check if token file exists
    if (!fs.existsSync(tokenPath)) {
      logger.debug(`No token found for deletion with key: ${key}`);
      return false;
    }

    // Delete the token file
    fs.unlinkSync(tokenPath);
    logger.debug(`Token deleted for key: ${key}`);
    return true;
  } catch (error) {
    logger.error(
      `Failed to delete token for key ${key}:`,
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
};

/**
 * Lists all stored token keys
 * @returns Array of token keys
 */
const listTokens = async (): Promise<string[]> => {
  try {
    ensureTokensDirectory();

    const files = fs.readdirSync(TOKENS_DIR);
    return files
      .filter((file) => file.endsWith('.token'))
      .map((file) => file.replace('.token', ''));
  } catch (error) {
    logger.error('Failed to list tokens:', error instanceof Error ? error.message : String(error));
    return [];
  }
};

const TokenStorage = {
  saveToken,
  getToken,
  deleteToken,
  listTokens,
};

export default TokenStorage;
