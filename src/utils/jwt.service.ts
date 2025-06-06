import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/config';
import { IUser } from '../models/user.model';

// Token types
export enum TokenType {
  ACCESS = 'access',
  REFRESH = 'refresh',
}

// Token payload interface
export interface TokenPayload {
  id: string;
  role: string;
  email?: string;
  tokenId?: string; // jti claim
  type?: TokenType;
  iat?: number;
  exp?: number;
}

// Represents a refresh token stored in the database
export interface RefreshToken {
  token: string;
  tokenId: string; // jti claim value
  expires: Date;
  createdAt: Date;
  createdByIp: string;
  isRevoked: boolean;
  revokedAt?: Date;
  replacedByTokenId?: string;
  deviceInfo?: string; // Device information for tracking
  isUsed?: boolean; // Flag to detect token reuse
}

// In-memory token blacklist (for development/testing)
// In production, this should be replaced with Redis or another distributed cache
const tokenBlacklist: Set<string> = new Set();

// Store token reuse events for security monitoring
const tokenReuseEvents: Array<{
  tokenId: string;
  userId: string;
  detectedAt: Date;
  ipAddress: string;
  deviceInfo?: string;
}> = [];

/**
 * JWT Service to handle all aspects of token management
 */
export class JwtService {
  /**
   * Generate an access token for a user
   * @param user The user to generate a token for
   * @returns The signed JWT access token
   */
  static generateAccessToken(user: IUser): string {
    const tokenId = uuidv4();

    const payload: TokenPayload = {
      id: user._id.toString(),
      role: user.role,
      email: user.email,
      tokenId,
      type: TokenType.ACCESS,
    };

    // Cast JWT_SECRET to string to satisfy TypeScript
    const secret = config.JWT_SECRET as jwt.Secret;

    return jwt.sign(payload, secret, {
      expiresIn: config.JWT_EXPIRES_IN,
      issuer: 'cuppa-api',
      audience: 'cuppa-client',
      jwtid: tokenId,
    });
  }

  /**
   * Generate a refresh token for a user
   * @param user The user to generate a refresh token for
   * @param ipAddress The IP address of the client
   * @param deviceInfo Optional device information for security tracking
   * @returns The refresh token object
   */
  static generateRefreshToken(user: IUser, ipAddress: string, deviceInfo?: string): RefreshToken {
    const tokenId = uuidv4();
    // Use the refresh token expiration from config
    const refreshExpiryDays = config.JWT_REFRESH_EXPIRE;
    const expires = new Date(Date.now() + refreshExpiryDays * 24 * 60 * 60 * 1000);

    const payload = {
      id: user._id.toString(),
      role: user.role,
      tokenId,
      type: TokenType.REFRESH,
    };

    // Cast JWT_SECRET to string to satisfy TypeScript
    const secret = config.JWT_SECRET as jwt.Secret;

    const token = jwt.sign(payload, secret, {
      expiresIn: `${refreshExpiryDays}d`,
      issuer: 'cuppa-api',
      audience: 'cuppa-client',
      jwtid: tokenId,
    });

    return {
      token,
      tokenId,
      expires,
      createdAt: new Date(),
      createdByIp: ipAddress,
      isRevoked: false,
      deviceInfo,
      isUsed: false,
    };
  }

  /**
   * Verify and decode a JWT token
   * @param token The token to verify
   * @returns The decoded token payload or null if invalid
   */
  static verifyToken(token: string): TokenPayload | null {
    try {
      // Check if the token is blacklisted
      if (this.isTokenBlacklisted(token)) {
        console.warn('Attempt to use blacklisted token detected');
        return null;
      }

      // Cast JWT_SECRET to string to satisfy TypeScript
      const secret = config.JWT_SECRET as jwt.Secret;

      const decoded = jwt.verify(token, secret) as TokenPayload;

      // Additional validation can be done here
      return decoded;
    } catch (error) {
      console.error('Token verification failed:', error);
      return null;
    }
  }

  /**
   * Add a token to the blacklist
   * @param token The token to blacklist
   * @param decodedToken The decoded token payload
   */
  static blacklistToken(token: string, decodedToken: TokenPayload): void {
    // Add token to blacklist
    tokenBlacklist.add(token);

    // In a production environment, you might want to store the blacklisted token
    // with an expiration time matching the token's expiry to avoid memory leaks
    if (decodedToken.exp) {
      const expiryTime = decodedToken.exp * 1000 - Date.now();
      if (expiryTime > 0) {
        setTimeout(() => {
          tokenBlacklist.delete(token);
        }, expiryTime);
      } else {
        // Token already expired, no need to keep it in the blacklist
        tokenBlacklist.delete(token);
      }
    }
  }

  /**
   * Check if a token is blacklisted
   * @param token The token to check
   * @returns Whether the token is blacklisted
   */
  static isTokenBlacklisted(token: string): boolean {
    return tokenBlacklist.has(token);
  }

  /**
   * Rotate a refresh token
   * @param refreshToken The current refresh token
   * @param user The user
   * @param ipAddress The IP address of the client
   * @param deviceInfo Optional device information
   * @returns The new refresh token
   */
  static rotateRefreshToken(
    refreshToken: RefreshToken,
    user: IUser,
    ipAddress: string,
    deviceInfo?: string
  ): RefreshToken {
    const newRefreshToken = this.generateRefreshToken(user, ipAddress, deviceInfo);

    // Mark the old refresh token as replaced
    refreshToken.isRevoked = true;
    refreshToken.revokedAt = new Date();
    refreshToken.replacedByTokenId = newRefreshToken.tokenId;
    refreshToken.isUsed = true;

    return newRefreshToken;
  }

  /**
   * Generate auth tokens for a user (both access and refresh)
   * @param user The user
   * @param ipAddress The IP address of the client
   * @param deviceInfo Optional device information for security tracking
   * @returns Object with access and refresh tokens
   */
  static generateAuthTokens(user: IUser, ipAddress: string, deviceInfo?: string) {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user, ipAddress, deviceInfo);

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * Extract JWT token from authorization header
   * @param authHeader The authorization header
   * @returns The extracted token or null
   */
  static extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    return authHeader.split(' ')[1];
  }

  /**
   * Detect token reuse which might indicate a security breach
   * @param tokenId The token ID to check
   * @param userId The user ID associated with the token
   * @param isUsed Whether the token has been used before
   * @param ipAddress The IP address of the client
   * @param deviceInfo Optional device information
   * @returns Whether token reuse was detected
   */
  static detectTokenReuse(
    tokenId: string,
    userId: string,
    isUsed: boolean,
    ipAddress: string,
    deviceInfo?: string
  ): boolean {
    if (isUsed) {
      // Log the reuse event for security monitoring
      tokenReuseEvents.push({
        tokenId,
        userId,
        detectedAt: new Date(),
        ipAddress,
        deviceInfo,
      });

      console.warn(
        `Token reuse detected! Token ID: ${tokenId}, User ID: ${userId}, IP: ${ipAddress}`
      );
      return true;
    }
    return false;
  }

  /**
   * Get token reuse events for security monitoring
   * @returns Array of token reuse events
   */
  static getTokenReuseEvents() {
    return tokenReuseEvents;
  }

  /**
   * Clear token reuse events (for testing or maintenance)
   */
  static clearTokenReuseEvents() {
    tokenReuseEvents.length = 0;
  }

  /**
   * Get cookie options for storing refresh tokens securely
   * @param expires The expiration date
   * @returns Cookie options object
   */
  static getRefreshTokenCookieOptions(expires: Date) {
    return {
      httpOnly: true, // Not accessible via JavaScript
      secure: config.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict' as const, // CSRF protection
      expires,
      path: '/api/auth/refresh-token', // Restrict to refresh endpoint
    };
  }
}

export default JwtService;
