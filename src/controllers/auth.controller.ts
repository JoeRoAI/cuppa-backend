import { Request, Response, NextFunction } from 'express';
import User from '../models/user.model';
import { usingMockDatabase } from '../config/db';
import config from '../config/config';
import JwtService, { RefreshToken } from '../utils/jwt.service';
import EmailService from '../utils/email.service';
import crypto from 'crypto';

// Mock ID generator for mock database mode
let mockUserId = 1;
export const mockUsers: any[] = [];

// For mock users, store refresh tokens
const mockUserRefreshTokens: { [userId: string]: RefreshToken[] } = {};

// For real implementation, we'd use a real email sending service
// For mock, we'll just simulate it
const mockResetTokens: { [email: string]: { token: string; expires: Date } } = {};

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      res.status(400).json({
        success: false,
        message: 'Please provide name, email and password',
      });
      return;
    }

    // Check if using mock database
    if (usingMockDatabase) {
      // Check if user with email already exists in mock data
      const existingUser = mockUsers.find((user) => user.email === email);
      if (existingUser) {
        res.status(400).json({
          success: false,
          message: 'User already exists with that email',
        });
        return;
      }

      // Create mock user object
      const mockUser = {
        _id: `mock_user_${mockUserId++}`,
        name,
        email,
        password: '*****', // In a real app we'd hash this
        role: 'user',
        preferences: {
          roastLevel: [],
          flavorProfile: [],
          brewMethods: [],
        },
        savedCoffees: [],
        ratingsHistory: [],
        refreshTokens: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Add to mock users array
      mockUsers.push(mockUser);

      // Initialize refresh tokens array for this user
      mockUserRefreshTokens[mockUser._id] = [];

      // Send token response
      sendTokenResponse(mockUser, 201, res, req.ip || 'unknown');
      return;
    }

    // Check if user exists in real database
    let user = await User.findOne({ email });

    if (user) {
      res.status(400).json({
        success: false,
        message: 'User already exists with that email',
      });
      return;
    }

    // Create user
    user = await User.create({
      name,
      email,
      password,
    });

    // Send token response
    sendTokenResponse(user, 201, res, req.ip || 'unknown');
  } catch (error: any) {
    console.error(`Error in register: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message,
    });
  }
};

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password, mfaCode } = req.body;
    const deviceInfo = req.headers['user-agent'] || 'unknown';
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

    // Validate email & password
    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
      return;
    }

    // Check if using mock database
    if (usingMockDatabase) {
      // Find user in mock data
      const user = mockUsers.find((user) => user.email === email);

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Invalid credentials',
        });
        return;
      }

      // Simulate MFA check if MFA is enabled for this mock user
      if (user.mfaEnabled) {
        // In a real app, we'd verify the MFA code
        // For mock, we'll check if mfaCode is provided and equals "123456"
        if (!mfaCode) {
          res.status(200).json({
            success: true,
            requiresMfa: true,
            message: 'MFA code required',
            email: user.email,
            // Don't return a token yet
          });
          return;
        }

        if (mfaCode !== '123456') {
          res.status(401).json({
            success: false,
            message: 'Invalid MFA code',
          });
          return;
        }
      }

      // Simulate adaptive authentication assessment
      const riskScore = assessRisk(ipAddress, deviceInfo, user);

      if (riskScore > 70) {
        // High risk login attempt - would require additional verification
        res.status(403).json({
          success: false,
          message:
            'Security check: This login attempt appears unusual. Please verify your identity through your email.',
          requiresVerification: true,
        });
        return;
      }

      // Send token response
      sendTokenResponse(user, 200, res, ipAddress);

      // Log the successful login for security monitoring
      console.log(
        `[SECURITY] Login success: ${user.email} from IP: ${ipAddress}, Device: ${deviceInfo.substring(0, 50)}`
      );

      return;
    }

    // Check for user in real database and include password
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
      return;
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
      return;
    }

    // Handle MFA if enabled for user (would typically be a field in the user model)
    if (user.mfaEnabled) {
      // If MFA code not provided, return response indicating MFA is required
      if (!mfaCode) {
        res.status(200).json({
          success: true,
          requiresMfa: true,
          message: 'MFA code required',
          email: user.email,
          // Don't return a token yet
        });
        return;
      }

      // Verify the MFA code (in a real app we'd implement this)
      const mfaValid = verifyMfaCode(user, mfaCode);
      if (!mfaValid) {
        res.status(401).json({
          success: false,
          message: 'Invalid MFA code',
        });
        return;
      }
    }

    // Perform adaptive authentication (risk assessment)
    const riskScore = assessRisk(ipAddress, deviceInfo, user);

    if (riskScore > 70) {
      // High risk login attempt - would require additional verification
      res.status(403).json({
        success: false,
        message:
          'Security check: This login attempt appears unusual. Please verify your identity through your email.',
        requiresVerification: true,
      });
      return;
    }

    // Send token response
    sendTokenResponse(user, 200, res, ipAddress);

    // Update last login time
    user.lastLogin = new Date();
    await user.save();

    // Log the successful login for security monitoring
    console.log(
      `[SECURITY] Login success: ${user.email} from IP: ${ipAddress}, Device: ${deviceInfo.substring(0, 50)}`
    );
  } catch (error: any) {
    console.error(`Error in login: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message,
    });
  }
};

/**
 * @desc    Get current logged in user
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Handle mock database mode
    if (usingMockDatabase) {
      res.status(200).json({
        success: true,
        data: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
        },
      });
      return;
    }

    // If using real database, find user by ID
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    console.error(`Error in getMe: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving user data',
      error: error.message,
    });
  }
};

/**
 * @desc   Refresh access token using refresh token
 * @route  POST /api/auth/refresh-token
 * @access Public
 */
export const refreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get refresh token from request body, header, or cookie
    const refreshToken = 
      req.body.refreshToken || 
      (req.headers.authorization && req.headers.authorization.startsWith('Bearer') 
        ? req.headers.authorization.split(' ')[1] 
        : undefined) || 
      req.cookies.refreshToken;

    if (!refreshToken) {
      res.status(400).json({
        success: false,
        message: 'No refresh token provided',
      });
      return;
    }

    // Get client info for security tracking
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const deviceInfo = req.headers['user-agent'] || 'unknown';

    // Verify token
    const decoded = JwtService.verifyToken(refreshToken);

    if (!decoded || decoded.type !== TokenType.REFRESH) {
      res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
      });
      return;
    }

    // Mock database handling
    if (usingMockDatabase) {
      // Find user
      const mockUser = mockUsers.find((user) => user._id === decoded.id);

      if (!mockUser) {
        res.status(401).json({
          success: false,
          message: 'Invalid refresh token (user not found)',
        });
        return;
      }

      // Find stored token
      const storedTokens = mockUserRefreshTokens[mockUser._id] || [];
      const storedToken = storedTokens.find((t) => t.tokenId === decoded.tokenId);

      if (!storedToken) {
        res.status(401).json({
          success: false,
          message: 'Refresh token not found',
        });
        return;
      }

      // Detect token reuse (potential security breach)
      if (storedToken.isUsed) {
        // This is a security breach - someone is trying to reuse a token
        // In a real application, you might want to:
        // 1. Revoke all tokens for this user
        // 2. Force the user to login again
        // 3. Notify the user of the security breach
        
        // Log security incident
        const tokenReuseDetected = JwtService.detectTokenReuse(
          storedToken.tokenId,
          mockUser._id,
          true, 
          ipAddress,
          deviceInfo as string
        );
        
        if (tokenReuseDetected) {
          // Invalidate all refresh tokens for this user
          mockUserRefreshTokens[mockUser._id] = mockUserRefreshTokens[mockUser._id].map(token => {
            return { ...token, isRevoked: true, revokedAt: new Date() };
          });
          
          res.status(401).json({
            success: false,
            message: 'Token reuse detected. All sessions have been terminated for security reasons.',
          });
          return;
        }
      }

      // Check if token is expired
      if (new Date() > storedToken.expires) {
        res.status(401).json({
          success: false,
          message: 'Refresh token expired',
        });
        return;
      }

      // Check if token is revoked
      if (storedToken.isRevoked) {
        res.status(401).json({
          success: false,
          message: 'Refresh token revoked',
        });
        return;
      }

      // Generate new access token
      const newAccessToken = JwtService.generateAccessToken(mockUser);
      
      // Rotate refresh token
      const newRefreshTokenObj = JwtService.rotateRefreshToken(
        storedToken, 
        mockUser, 
        ipAddress,
        deviceInfo as string
      );

      // Update stored tokens
      mockUserRefreshTokens[mockUser._id] = [
        ...mockUserRefreshTokens[mockUser._id].filter((t) => t.tokenId !== storedToken.tokenId),
        newRefreshTokenObj,
      ];

      // Set refresh token in HTTP-only cookie
      res.cookie(
        'refreshToken',
        newRefreshTokenObj.token,
        JwtService.getRefreshTokenCookieOptions(newRefreshTokenObj.expires)
      );

      // Return new tokens
      res.status(200).json({
        success: true,
        accessToken: newAccessToken,
        refreshToken: newRefreshTokenObj,
        user: {
          id: mockUser._id,
          name: mockUser.name,
          email: mockUser.email,
          role: mockUser.role,
        },
      });
      return;
    }

    // Find user in real database
    const user = await User.findById(decoded.id).select('+refreshTokens');

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Invalid refresh token (user not found)',
      });
      return;
    }

    // Find stored token
    const storedToken = user.refreshTokens.find((t) => t.tokenId === decoded.tokenId);

    if (!storedToken) {
      res.status(401).json({
        success: false,
        message: 'Refresh token not found',
      });
      return;
    }

    // Detect token reuse (potential security breach)
    if (storedToken.isUsed) {
      // Token reuse detected - security breach!
      const tokenReuseDetected = JwtService.detectTokenReuse(
        storedToken.tokenId,
        user._id.toString(),
        true, 
        ipAddress,
        deviceInfo as string
      );
      
      if (tokenReuseDetected) {
        // Invalidate all refresh tokens for this user
        user.refreshTokens = user.refreshTokens.map(token => {
          return { ...token, isRevoked: true, revokedAt: new Date() };
        });
        
        await user.save();
        
        res.status(401).json({
          success: false,
          message: 'Token reuse detected. All sessions have been terminated for security reasons.',
        });
        return;
      }
    }

    // Check if token is expired
    if (new Date() > storedToken.expires) {
      res.status(401).json({
        success: false,
        message: 'Refresh token expired',
      });
      return;
    }

    // Check if token is revoked
    if (storedToken.isRevoked) {
      res.status(401).json({
        success: false,
        message: 'Refresh token revoked',
      });
      return;
    }

    // Generate new access token
    const newAccessToken = JwtService.generateAccessToken(user);
    
    // Rotate refresh token
    const newRefreshTokenObj = JwtService.rotateRefreshToken(
      storedToken, 
      user, 
      ipAddress,
      deviceInfo as string
    );

    // Update stored tokens
    user.refreshTokens = [
      ...user.refreshTokens.filter((t) => t.tokenId !== storedToken.tokenId),
      newRefreshTokenObj,
    ];

    await user.save();

    // Set refresh token in HTTP-only cookie
    res.cookie(
      'refreshToken',
      newRefreshTokenObj.token,
      JwtService.getRefreshTokenCookieOptions(newRefreshTokenObj.expires)
    );

    // Return new tokens
    res.status(200).json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshTokenObj,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error: any) {
    console.error(`Error in refreshToken: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error while refreshing token',
      error: error.message,
    });
  }
};

/**
 * @desc   Revoke refresh token (logout from a specific device)
 * @route  POST /api/auth/revoke-token
 * @access Private
 */
export const revokeToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    const userId = req.user.id;

    if (!refreshToken) {
      res.status(400).json({
        success: false,
        message: 'Refresh token is required',
      });
      return;
    }

    // Handle mock database mode
    if (usingMockDatabase) {
      const refreshTokens = mockUserRefreshTokens[userId] || [];

      // Find the token in the mock storage
      const tokenIndex = refreshTokens.findIndex(
        (rt) => rt.token === refreshToken && !rt.isRevoked
      );

      if (tokenIndex === -1) {
        res.status(404).json({
          success: false,
          message: 'Token not found or already revoked',
        });
        return;
      }

      // Revoke the token
      refreshTokens[tokenIndex].isRevoked = true;
      refreshTokens[tokenIndex].revokedAt = new Date();

      // Update the mock storage
      mockUserRefreshTokens[userId] = refreshTokens;

      res.status(200).json({
        success: true,
        message: 'Token revoked successfully',
      });

      return;
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Find the token in the database
    const tokenIndex = user.refreshTokens.findIndex(
      (rt) => rt.token === refreshToken && !rt.isRevoked
    );

    if (tokenIndex === -1) {
      res.status(404).json({
        success: false,
        message: 'Token not found or already revoked',
      });
      return;
    }

    // Revoke the token
    user.refreshTokens[tokenIndex].isRevoked = true;
    user.refreshTokens[tokenIndex].revokedAt = new Date();

    // Save the user
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Token revoked successfully',
    });
  } catch (error: any) {
    console.error(`Error in revokeToken: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error revoking token',
      error: error.message,
    });
  }
};

/**
 * Get token from model, create cookie and send response
 */
const sendTokenResponse = (
  user: any,
  statusCode: number,
  res: Response,
  ipAddress: string
): void => {
  // Get device info for security tracking
  const deviceInfo = res.req.headers['user-agent'] || 'unknown';

  // Generate tokens
  const { accessToken, refreshToken } = JwtService.generateAuthTokens(user, ipAddress, deviceInfo as string);

  // Set refresh token in secure HTTP-only cookie
  res.cookie(
    'refreshToken',
    refreshToken.token,
    JwtService.getRefreshTokenCookieOptions(refreshToken.expires)
  );

  // For mock database mode
  if (usingMockDatabase) {
    // Store refresh token in mock storage
    if (!mockUserRefreshTokens[user._id]) {
      mockUserRefreshTokens[user._id] = [];
    }
    mockUserRefreshTokens[user._id].push(refreshToken);

    // Send response
    res.status(statusCode).json({
      success: true,
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
    return;
  }

  // For real database
  // Save refresh token to user document
  user.refreshTokens = [...(user.refreshTokens || []), refreshToken];
  user.lastLogin = new Date();
  user.save();

  // Send response
  res.status(statusCode).json({
    success: true,
    token: accessToken,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
};

// Additional functions for MFA and security

/**
 * Verify MFA code from authenticator app or SMS
 * In a real app, this would be implemented with libraries like speakeasy for TOTP
 */
const verifyMfaCode = (user: any, mfaCode: string): boolean => {
  // This is just a mock implementation
  // In a real app, we would:
  // 1. Use a library like speakeasy for TOTP (Time-based One-Time Password)
  // 2. Or verify against a recently sent SMS code stored in a short-lived cache

  if (usingMockDatabase) {
    return mfaCode === '123456'; // Simple mock check
  }

  // For a real database implementation:
  // return speakeasy.totp.verify({
  //   secret: user.mfaSecret,
  //   encoding: 'base32',
  //   token: mfaCode,
  //   window: 1  // Allow codes from 30 seconds before/after
  // });

  return false; // Default to fail-safe
};

/**
 * Assess login risk based on various factors
 * Returns a score from 0-100 where higher values indicate higher risk
 */
const assessRisk = (ipAddress: string, deviceInfo: string, user: any): number => {
  let riskScore = 0;

  // In a mock database, we'll just simulate some risk assessment
  if (usingMockDatabase) {
    // If this is the first login from a device, add risk
    const knownDevices = user.knownDevices || [];
    if (!knownDevices.includes(deviceInfo)) {
      riskScore += 30;
    }

    // If this is a new IP, add risk
    const knownIPs = user.knownIPs || [];
    if (!knownIPs.includes(ipAddress)) {
      riskScore += 20;
    }

    // If time of day is unusual for this user, add risk
    const hour = new Date().getHours();
    if (hour < 5 || hour > 23) {
      riskScore += 15;
    }

    // Mock successful login adding this device/IP to known list
    // In a real app, we'd update the user's profile in the database
    if (!user.knownDevices) user.knownDevices = [];
    if (!user.knownIPs) user.knownIPs = [];

    if (!user.knownDevices.includes(deviceInfo)) {
      user.knownDevices.push(deviceInfo);
    }
    if (!user.knownIPs.includes(ipAddress)) {
      user.knownIPs.push(ipAddress);
    }
  }

  // In a real app, we would have a much more sophisticated risk engine
  // considering factors like:
  // - Login time patterns for this user
  // - Geolocation of IP and distance from usual locations
  // - Device fingerprinting
  // - Behavioral biometrics (typing patterns, mouse movements)
  // - Access to sensitive resources

  return riskScore;
};

/**
 * @desc    Enable MFA for a user
 * @route   POST /api/auth/mfa/enable
 * @access  Private
 */
export const enableMfa = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { type } = req.body; // 'authenticator', 'sms', or 'email'

    // Check if using mock database
    if (usingMockDatabase) {
      const userId = req.user.id;
      const mockUser = mockUsers.find((user) => user._id === userId);

      if (!mockUser) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // Enable MFA for mock user
      mockUser.mfaEnabled = true;
      mockUser.mfaType = type || 'authenticator';

      // In a real app, we would:
      // 1. Generate a secret key
      // 2. Create a QR code or send a code via SMS/email
      // 3. Verify the first code entered by the user

      // For mock, we'll just return success
      res.status(200).json({
        success: true,
        message: 'MFA enabled successfully',
        mfaEnabled: true,
        mfaType: mockUser.mfaType,
        mfaSecret: 'MOCK_SECRET_123456', // Would be a real secret in production
        qrCode:
          'https://api.qrserver.com/v1/create-qr-code/?data=otpauth://totp/Cuppa:' +
          mockUser.email +
          '?secret=MOCK_SECRET_123456&issuer=Cuppa&algorithm=SHA1&digits=6&period=30',
      });
      return;
    }

    // Real database implementation
    const user = await User.findById(req.user.id);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // In a real app, we would:
    // 1. Generate a secret key using a library like speakeasy
    // const secret = speakeasy.generateSecret({ length: 20, name: `Cuppa:${user.email}` });

    // 2. Save to user record
    user.mfaEnabled = true;
    user.mfaType = type || 'authenticator';
    // user.mfaSecret = secret.base32;

    await user.save();

    // 3. Return the secret and QR code for the user to scan
    res.status(200).json({
      success: true,
      message: 'MFA enabled successfully',
      mfaEnabled: true,
      mfaType: user.mfaType,
      // mfaSecret: secret.base32,
      // qrCode: secret.otpauth_url,
    });
  } catch (error: any) {
    console.error(`Error in enableMfa: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error enabling MFA',
      error: error.message,
    });
  }
};

/**
 * @desc    Disable MFA for a user
 * @route   POST /api/auth/mfa/disable
 * @access  Private
 */
export const disableMfa = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check if using mock database
    if (usingMockDatabase) {
      const userId = req.user.id;
      const mockUser = mockUsers.find((user) => user._id === userId);

      if (!mockUser) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // Disable MFA for mock user
      mockUser.mfaEnabled = false;
      mockUser.mfaSecret = undefined;

      res.status(200).json({
        success: true,
        message: 'MFA disabled successfully',
      });
      return;
    }

    // Real database implementation
    const user = await User.findById(req.user.id);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    user.mfaEnabled = false;
    user.mfaSecret = undefined;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'MFA disabled successfully',
    });
  } catch (error: any) {
    console.error(`Error in disableMfa: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error disabling MFA',
      error: error.message,
    });
  }
};

/**
 * @desc    Logout user / clear cookie
 * @route   GET /api/auth/logout
 * @access  Private
 */
export const logout = (req: Request, res: Response, next: NextFunction): void => {
  // Remove token cookie
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000), // Expires in 10 seconds
    httpOnly: true,
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};

/**
 * @desc    Forgot password
 * @route   POST /api/auth/forgotpassword
 * @access  Public
 */
export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        message: 'Please provide an email address',
      });
      return;
    }

    // Check rate limits (would use Redis or similar in production)
    // This is a simplified version
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(clientIp, 'forgotPassword', 5)) {
      // Max 5 requests per hour
      res.status(429).json({
        success: false,
        message: 'Too many password reset attempts. Please try again later.',
      });
      return;
    }

    // Check if using mock database
    if (usingMockDatabase) {
      // Find user in mock data
      const mockUser = mockUsers.find((user) => user.email === email);

      if (!mockUser) {
        // For security, don't reveal if email exists or not
        res.status(200).json({
          success: true,
          message: 'If a user with that email exists, a password reset link has been sent',
        });
        return;
      }

      // Generate a reset token using crypto
      const resetToken = crypto.randomBytes(32).toString('hex');

      // Hash the token for storage (so it's not stored in plain text)
      const hashedToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

      // Store hashed token in mock storage with expiration
      mockUser.resetPasswordToken = hashedToken;
      mockUser.resetPasswordExpire = new Date(Date.now() + 3600000); // 1 hour

      // Generate reset URL - use config for the frontend URL
      const resetUrl = `${config.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

      try {
        // Send email with token
        await EmailService.sendPasswordResetEmail(
          email,
          mockUser.name,
          resetToken,
          resetUrl
        );

        res.status(200).json({
          success: true,
          message: 'Password reset email sent',
        });
      } catch (err) {
        // If email fails, clear the reset token
        mockUser.resetPasswordToken = undefined;
        mockUser.resetPasswordExpire = undefined;

        res.status(500).json({
          success: false,
          message: 'Email could not be sent',
        });
      }
      return;
    }

    // Real database implementation
    const user = await User.findOne({ email });

    if (!user) {
      // For security, don't reveal if email exists or not
      res.status(200).json({
        success: true,
        message: 'If a user with that email exists, a password reset link has been sent',
      });
      return;
    }

    // Generate a reset token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Hash the token for storage
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Set the token and expiration on the user document
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpire = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    // Generate reset URL
    const resetUrl = `${config.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    try {
      // Send email with token
      await EmailService.sendPasswordResetEmail(
        email,
        user.name,
        resetToken,
        resetUrl
      );

      res.status(200).json({
        success: true,
        message: 'Password reset email sent',
      });
    } catch (err) {
      // If email fails, clear the reset token
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();

      res.status(500).json({
        success: false,
        message: 'Email could not be sent',
      });
    }
  } catch (error: any) {
    console.error(`Error in forgotPassword: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error during password reset request',
      error: error.message,
    });
  }
};

/**
 * @desc    Reset password
 * @route   POST /api/auth/resetpassword
 * @access  Public
 */
export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token, email, password, confirmPassword } = req.body;

    // Validate inputs
    if (!token || !email || !password) {
      res.status(400).json({
        success: false,
        message: 'Please provide all required fields',
      });
      return;
    }

    // Validate password confirmation
    if (password !== confirmPassword) {
      res.status(400).json({
        success: false,
        message: 'Passwords do not match',
      });
      return;
    }

    // Check password strength
    if (password.length < 8) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
      });
      return;
    }

    // Hash the token from the request to compare with the stored hashed token
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Check if using mock database
    if (usingMockDatabase) {
      // Find user with matching email
      const mockUser = mockUsers.find((user) => user.email === email);

      if (!mockUser) {
        res.status(400).json({
          success: false,
          message: 'Invalid reset token',
        });
        return;
      }

      // Check if token matches and is not expired
      if (
        !mockUser.resetPasswordToken ||
        mockUser.resetPasswordToken !== hashedToken ||
        !mockUser.resetPasswordExpire ||
        mockUser.resetPasswordExpire < new Date()
      ) {
        res.status(400).json({
          success: false,
          message: 'Invalid or expired reset token',
        });
        return;
      }

      // Update password (in a real app we'd hash it)
      mockUser.password = password;
      
      // Clear reset token fields
      mockUser.resetPasswordToken = undefined;
      mockUser.resetPasswordExpire = undefined;

      // Log successful password reset for security auditing
      console.log(
        `[SECURITY] Password reset successful for ${mockUser.email} from IP: ${req.ip || 'unknown'}`
      );

      // Send notification email about password change
      await EmailService.sendPasswordChangeNotificationEmail(
        mockUser.email,
        mockUser.name
      );

      // Return success and new login token
      sendTokenResponse(mockUser, 200, res, req.ip || 'unknown');
      return;
    }

    // Real database implementation
    // Find user with the reset token that hasn't expired
    const user = await User.findOne({
      email,
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token',
      });
      return;
    }

    // Update password
    user.password = password;
    
    // Clear reset token fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    
    // Invalidate all active sessions for security
    // In a production app, you might want to keep the current session active
    user.refreshTokens = [];
    
    await user.save();

    // Log successful password reset for security auditing
    console.log(
      `[SECURITY] Password reset successful for ${user.email} from IP: ${req.ip || 'unknown'}`
    );

    // Send notification email about password change
    await EmailService.sendPasswordChangeNotificationEmail(
      user.email,
      user.name
    );

    // Return success and new login token
    sendTokenResponse(user, 200, res, req.ip || 'unknown');
  } catch (error: any) {
    console.error(`Error in resetPassword: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error during password reset',
      error: error.message,
    });
  }
};

/**
 * Helper function to generate a reset token
 */
const generateResetToken = (): string => {
  // Use crypto for secure token generation
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Helper function for simple rate limiting
 */
const rateLimits: { [key: string]: { count: number; resetTime: number } } = {};

const checkRateLimit = (ip: string, action: string, maxAttempts: number): boolean => {
  const key = `${ip}:${action}`;
  const now = Date.now();
  const hourInMs = 3600000;

  // Initialize or reset if expired
  if (!rateLimits[key] || rateLimits[key].resetTime < now) {
    rateLimits[key] = {
      count: 1,
      resetTime: now + hourInMs,
    };
    return true;
  }

  // Increment and check
  rateLimits[key].count += 1;

  return rateLimits[key].count <= maxAttempts;
};

/**
 * @desc    Handle social authentication callback
 * @route   GET /api/auth/:provider/callback
 * @access  Public
 */
export const handleSocialAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // At this point, passport has already authenticated the user
    // and attached the user object to req.user

    // Generate JWT tokens using our JWT service
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Authentication failed',
      });
      return;
    }

    // Use JWT service to generate tokens
    const JwtService = require('../utils/jwt.service').default;
    const { accessToken, refreshToken } = await JwtService.generateAuthTokens(user, req.ip);

    // Set cookie options
    const cookieOptions = {
      expires: new Date(Date.now() + config.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000),
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
    };

    // Set the access token cookie
    res.cookie('token', accessToken, cookieOptions);

    // For development, include tokens in response
    if (config.NODE_ENV === 'development') {
      res.status(200).json({
        success: true,
        message: 'Social authentication successful',
        accessToken,
        refreshToken,
      });
      return;
    }

    // For production, just return success and redirect
    // You can modify this to redirect to the frontend with a token parameter
    const redirectUrl = `/profile?auth=success`;
    res.redirect(redirectUrl);
  } catch (error: any) {
    console.error(`Error in handleSocialAuth: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error during social authentication',
      error: error.message,
    });
  }
};
