import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/user.model';
import config from '../config/config';
import { usingMockDatabase } from '../config/db';
import JwtService, { TokenPayload, TokenType } from '../utils/jwt.service';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
      tokenPayload?: TokenPayload;
    }
  }
}

interface JwtPayload {
  id: string;
  role: string;
  iat?: number;
  exp?: number;
}

// Mock users data is maintained in the auth controller
// This is a simple mock mechanism for development/testing
import { mockUsers } from '../controllers/auth.controller';

/**
 * Authentication middleware to protect routes
 * Verifies the JWT token and adds the user to the request
 */
export const protect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let token;

    // Check if auth header exists and starts with Bearer
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      // Set token from Bearer token
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.token) {
      // Set token from cookie
      token = req.cookies.token;
    }

    // Check if token exists
    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Not authorized to access this route',
        error: 'No authentication token provided',
      });
      return;
    }

    // Handle mock database mode
    if (usingMockDatabase) {
      // For mock database, we'll check if token starts with our mock prefix
      if (token.startsWith('mock_jwt_token_for_')) {
        const userId = token.replace('mock_jwt_token_for_', '');

        // Find user in mock data
        const mockUser = mockUsers.find((user) => user._id === userId);

        if (!mockUser) {
          res.status(401).json({
            success: false,
            message: 'User not found or invalid token',
            error: 'Authentication failed',
          });
          return;
        }

        // Set user in request
        req.user = {
          id: mockUser._id,
          name: mockUser.name,
          email: mockUser.email,
          role: mockUser.role,
        };

        next();
        return;
      } else {
        // Use JWT service to verify token
        const decoded = JwtService.verifyToken(token);
        if (!decoded || decoded.type !== TokenType.ACCESS) {
          res.status(401).json({
            success: false,
            message: 'Not authorized to access this route',
            error: decoded ? 'Invalid token type' : 'Token verification failed',
          });
          return;
        }

        // Store the token payload in the request for potential use in other middleware
        req.tokenPayload = decoded;

        // Find user in mock data
        const mockUser = mockUsers.find((user) => user._id === decoded.id);

        if (!mockUser) {
          res.status(401).json({
            success: false,
            message: 'User not found or invalid token',
            error: 'User associated with token not found',
          });
          return;
        }

        // Set user in request
        req.user = {
          id: mockUser._id,
          name: mockUser.name,
          email: mockUser.email,
          role: mockUser.role,
        };

        next();
        return;
      }
    }

    // For real database
    // Use JWT service to verify token
    const decoded = JwtService.verifyToken(token);
    if (!decoded || decoded.type !== TokenType.ACCESS) {
      res.status(401).json({
        success: false,
        message: 'Not authorized to access this route',
        error: decoded ? 'Invalid token type' : 'Token verification failed',
      });
      return;
    }

    // Store the token payload in the request
    req.tokenPayload = decoded;

    // Add user to request object
    req.user = await User.findById(decoded.id);

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not found or invalid token',
        error: 'User associated with token not found',
      });
      return;
    }

    // Log auth success for audit trail (in production, use proper logging)
    console.log(`[AUTH] ${req.user.email} (${req.user.role}) accessed ${req.originalUrl}`);

    next();
  } catch (error: any) {
    console.error('Authentication error:', error.message);
    res.status(401).json({
      success: false,
      message: 'Not authorized to access this route',
      error: error.message,
    });
    return;
  }
};

/**
 * CSRF protection middleware for token-based operations
 * This middleware should be used on routes that accept refresh tokens
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  // Check Origin header against Host header to prevent CSRF
  const origin = req.headers.origin;
  const host = req.headers.host;

  if (!origin) {
    // No origin header in the request might be a server-to-server call
    // Proceed with caution or implement additional checks
    next();
    return;
  }

  try {
    // Extract domain from origin header
    const originDomain = new URL(origin).hostname;

    // Compare with the host
    if (host !== originDomain && !originDomain.endsWith(`.${host}`)) {
      res.status(403).json({
        success: false,
        message: 'CSRF protection: Origin does not match host',
        error: 'Cross-site request forbidden',
      });
      return;
    }

    next();
  } catch (error) {
    res.status(403).json({
      success: false,
      message: 'Invalid origin header',
      error: 'CSRF protection failure',
    });
    return;
  }
};

/**
 * Middleware to restrict access based on user role
 * Can be used with a single role or an array of roles
 */
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Not authorized to access this route',
        error: 'User not authenticated',
      });
      return;
    }

    // Check if user role is in the allowed roles
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`,
        error: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
};

/**
 * Hierarchical role-based access control
 * Assumes role hierarchy: admin > manager > user
 * @param minimumRole The minimum role required to access the route
 */
export const requireRole = (minimumRole: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Not authorized to access this route',
        error: 'User not authenticated',
      });
      return;
    }

    const roleHierarchy = {
      admin: 3,
      manager: 2,
      user: 1,
      guest: 0,
    };

    const userRoleLevel = roleHierarchy[req.user.role] || 0;
    const requiredRoleLevel = roleHierarchy[minimumRole] || 0;

    if (userRoleLevel < requiredRoleLevel) {
      res.status(403).json({
        success: false,
        message: `User role ${req.user.role} does not have sufficient privileges`,
        error: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
};
