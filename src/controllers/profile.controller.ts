import { Request, Response, NextFunction } from 'express';
import User from '../models/user.model';
import { usingMockDatabase } from '../config/db';
import { mockUsers } from './auth.controller';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// For mock implementation, store tokens
const mockVerificationTokens: { [key: string]: { token: string; expires: Date } } = {};

// Mock data for user stats
const mockUserStats = {
  checkIns: 23,
  uniqueCoffees: 18,
  badges: 5,
  totalRatings: 42,
  averageRating: 4.2,
  favoriteBrewMethod: 'Pour Over',
  monthlyCheckIns: 8,
};

// Mock data for user badges
const mockUserBadges = [
  {
    id: 'coffee-explorer',
    name: 'Coffee Explorer',
    description: 'Tried coffee from 10 different regions',
    icon: 'coffee',
    color: '#E07A5F',
    earnedAt: '2024-01-15T00:00:00Z',
    category: 'Discovery',
  },
  {
    id: 'check-in-champion',
    name: 'Check-in Champion',
    description: 'Completed 20 coffee shop check-ins',
    icon: 'map-pin',
    color: '#81B29A',
    earnedAt: '2024-02-20T00:00:00Z',
    category: 'Activity',
  },
  {
    id: 'social-butterfly',
    name: 'Social Butterfly',
    description: 'Connected with 5 other coffee enthusiasts',
    icon: 'star',
    color: '#F2CC8F',
    earnedAt: '2024-03-10T00:00:00Z',
    category: 'Social',
  },
];

/**
 * @desc    Get current user profile
 * @route   GET /api/profile
 * @access  Private
 */
export const getProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (usingMockDatabase) {
      // Find the mock user by ID
      const userId = req.user?.id;
      const mockUser = mockUsers.find((user) => user._id === userId);

      if (!mockUser) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // Return user without sensitive information
      const { password, ...userWithoutPassword } = mockUser;

      res.status(200).json({
        success: true,
        data: userWithoutPassword,
      });
      return;
    }

    // Get real user from database (already available in req.user)
    const userId = req.user?.id;
    const user = await User.findById(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    console.error(`Error in getProfile: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving profile',
      error: error.message,
    });
  }
};

/**
 * @desc    Update user profile
 * @route   PUT /api/profile
 * @access  Private
 */
export const updateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { name, email, bio, location } = req.body;

    if (usingMockDatabase) {
      // Find and update mock user
      const userIndex = mockUsers.findIndex((user) => user._id === userId);

      if (userIndex === -1) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // Update mock user
      mockUsers[userIndex] = {
        ...mockUsers[userIndex],
        name: name || mockUsers[userIndex].name,
        email: email || mockUsers[userIndex].email,
        bio: bio || mockUsers[userIndex].bio,
        location: location || mockUsers[userIndex].location,
        updatedAt: new Date(),
      };

      const { password, ...userWithoutPassword } = mockUsers[userIndex];

      res.status(200).json({
        success: true,
        data: userWithoutPassword,
      });
      return;
    }

    // Update real user
    const user = await User.findByIdAndUpdate(
      userId,
      { name, email, bio, location },
      { new: true, runValidators: true }
    );

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    console.error(`Error in updateProfile: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error updating profile',
      error: error.message,
    });
  }
};

/**
 * @desc    Upload profile image
 * @route   POST /api/profile/image
 * @access  Private
 */
export const uploadProfileImage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Handle profile image upload
    // This would typically involve storing the file and updating the user record
    res.json({
      success: true,
      message: 'Profile image uploaded successfully',
      data: {
        imageUrl: '/uploads/profile/default.jpg', // Mock URL
      },
    });
  } catch (error: any) {
    console.error('Error uploading profile image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload profile image',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * @desc    Update user preferences
 * @route   PUT /api/profile/preferences
 * @access  Private
 */
export const updatePreferences = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { preferences } = req.body;

    // Handle preferences update
    // This would typically involve updating the user record in the database
    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: {
        preferences: preferences || {
          favoriteBrewMethod: 'Pour Over',
          preferredRoastLevel: 'Medium',
          notifications: true,
        },
      },
    });
  } catch (error: any) {
    console.error('Error updating preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update preferences',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * @desc    Get user statistics
 * @route   GET /api/profile/stats
 * @access  Private
 */
export const getUserStats = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // In a real application, you would fetch actual user stats from the database
    // For now, return mock data
    res.json({
      success: true,
      data: mockUserStats,
      message: 'User stats retrieved successfully',
    });
  } catch (error: any) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user stats',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * @desc    Get user badges
 * @route   GET /api/profile/badges
 * @access  Private
 */
export const getUserBadges = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // In a real application, you would fetch actual user badges from the database
    // For now, return mock data
    res.json({
      success: true,
      data: mockUserBadges,
      message: 'User badges retrieved successfully',
    });
  } catch (error: any) {
    console.error('Error fetching user badges:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user badges',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * @desc    Update user password
 * @route   PUT /api/profile/password
 * @access  Private
 */
export const updatePassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user?.id;

    // Validate required fields
    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        message: 'Please provide current and new password',
      });
      return;
    }

    // Validate new password length
    if (newPassword.length < 6) {
      res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters',
      });
      return;
    }

    if (usingMockDatabase) {
      // Find the mock user
      const mockUserIndex = mockUsers.findIndex((user) => user._id === userId);

      if (mockUserIndex === -1) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // In a mock environment, we'll just check if currentPassword equals the stored password
      // (In a real app, we'd use bcrypt.compare as shown below)
      if (mockUsers[mockUserIndex].password !== currentPassword) {
        res.status(401).json({
          success: false,
          message: 'Current password is incorrect',
        });
        return;
      }

      // Update password
      mockUsers[mockUserIndex].password = newPassword;
      mockUsers[mockUserIndex].updatedAt = new Date();

      res.status(200).json({
        success: true,
        message: 'Password updated successfully',
      });
      return;
    }

    // Get user from real database with password
    const user = await User.findById(userId).select('+password');

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Check current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        message: 'Current password is incorrect',
      });
      return;
    }

    // Set new password (encryption will be handled in the pre-save hook)
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error: any) {
    console.error(`Error in updatePassword: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error updating password',
      error: error.message,
    });
  }
};

/**
 * @desc    Request email verification
 * @route   POST /api/profile/verify-email/request
 * @access  Private
 */
export const requestEmailVerification = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (usingMockDatabase) {
      // Find the mock user
      const mockUser = mockUsers.find((user) => user._id === userId);

      if (!mockUser) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // Generate a verification token
      const token = crypto.randomBytes(20).toString('hex');

      // Store the token with an expiration time
      mockVerificationTokens[mockUser.email] = {
        token,
        expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour expiration
      };

      // In a real app, we would send an email with a verification link
      // For mock purposes, just return the token
      res.status(200).json({
        success: true,
        message: 'Verification email sent',
        token, // Only include this in mock/development mode
      });
      return;
    }

    // Get user from real database
    const user = await User.findById(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Generate a verification token
    const token = crypto.randomBytes(20).toString('hex');

    // In a real implementation, store the token in the user document with an expiration
    // and send an email with a verification link

    // For now, we'll just return success
    res.status(200).json({
      success: true,
      message: 'Verification email sent',
    });
  } catch (error: any) {
    console.error(`Error in requestEmailVerification: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error requesting email verification',
      error: error.message,
    });
  }
};

/**
 * @desc    Verify email with token
 * @route   POST /api/profile/verify-email/:token
 * @access  Private
 */
export const verifyEmail = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token } = req.params;

    if (usingMockDatabase) {
      // Find the user with this token
      const userEmail = Object.keys(mockVerificationTokens).find(
        (email) => mockVerificationTokens[email].token === token
      );

      if (!userEmail) {
        res.status(400).json({
          success: false,
          message: 'Invalid or expired verification token',
        });
        return;
      }

      // Check if token is expired
      if (mockVerificationTokens[userEmail].expires < new Date()) {
        // Remove expired token
        delete mockVerificationTokens[userEmail];

        res.status(400).json({
          success: false,
          message: 'Verification token has expired',
        });
        return;
      }

      // Find the user with this email
      const mockUserIndex = mockUsers.findIndex((user) => user.email === userEmail);

      if (mockUserIndex === -1) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // Mark email as verified
      mockUsers[mockUserIndex].emailVerified = true;
      mockUsers[mockUserIndex].updatedAt = new Date();

      // Remove the used token
      delete mockVerificationTokens[userEmail];

      res.status(200).json({
        success: true,
        message: 'Email successfully verified',
      });
      return;
    }

    // In a real implementation, find the user with this token and verify their email
    // For now, just return success
    res.status(200).json({
      success: true,
      message: 'Email successfully verified',
    });
  } catch (error: any) {
    console.error(`Error in verifyEmail: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error verifying email',
      error: error.message,
    });
  }
};

/**
 * @desc    Request phone verification
 * @route   POST /api/profile/verify-phone/request
 * @access  Private
 */
export const requestPhoneVerification = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { phoneNumber } = req.body;
    const userId = req.user?.id;

    if (!phoneNumber) {
      res.status(400).json({
        success: false,
        message: 'Please provide a phone number',
      });
      return;
    }

    if (usingMockDatabase) {
      // Generate a 6-digit verification code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

      // Store the code with an expiration time (keyed by user ID + phone)
      const key = `${userId}:${phoneNumber}`;
      mockVerificationTokens[key] = {
        token: verificationCode,
        expires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes expiration
      };

      // In a real app, we would send an SMS with the code
      // For mock purposes, just return the code
      res.status(200).json({
        success: true,
        message: 'Verification code sent to your phone',
        code: verificationCode, // Only include this in mock/development mode
      });
      return;
    }

    // In a real implementation, store the phone number and send a verification SMS
    // For now, just return success
    res.status(200).json({
      success: true,
      message: 'Verification code sent to your phone',
    });
  } catch (error: any) {
    console.error(`Error in requestPhoneVerification: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error requesting phone verification',
      error: error.message,
    });
  }
};

/**
 * @desc    Verify phone with token
 * @route   POST /api/profile/verify-phone/:token
 * @access  Private
 */
export const verifyPhone = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token } = req.params;
    const { phoneNumber } = req.body;
    const userId = req.user?.id;

    if (!phoneNumber) {
      res.status(400).json({
        success: false,
        message: 'Please provide the phone number',
      });
      return;
    }

    if (usingMockDatabase) {
      // Check if token exists and is valid
      const key = `${userId}:${phoneNumber}`;

      if (!mockVerificationTokens[key] || mockVerificationTokens[key].token !== token) {
        res.status(400).json({
          success: false,
          message: 'Invalid verification code',
        });
        return;
      }

      // Check if token is expired
      if (mockVerificationTokens[key].expires < new Date()) {
        // Remove expired token
        delete mockVerificationTokens[key];

        res.status(400).json({
          success: false,
          message: 'Verification code has expired',
        });
        return;
      }

      // Find the user
      const mockUserIndex = mockUsers.findIndex((user) => user._id === userId);

      if (mockUserIndex === -1) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // Update user with verified phone
      mockUsers[mockUserIndex].phoneNumber = phoneNumber;
      mockUsers[mockUserIndex].phoneVerified = true;
      mockUsers[mockUserIndex].updatedAt = new Date();

      // Remove the used token
      delete mockVerificationTokens[key];

      res.status(200).json({
        success: true,
        message: 'Phone number successfully verified',
      });
      return;
    }

    // In a real implementation, verify the token and update the user's phone verification status
    // For now, just return success
    res.status(200).json({
      success: true,
      message: 'Phone number successfully verified',
    });
  } catch (error: any) {
    console.error(`Error in verifyPhone: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error verifying phone',
      error: error.message,
    });
  }
};

/**
 * @desc    Request account deletion
 * @route   DELETE /api/profile
 * @access  Private
 */
export const requestAccountDeletion = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (usingMockDatabase) {
      // Generate a deletion confirmation token
      const token = crypto.randomBytes(20).toString('hex');

      // Find the user
      const mockUser = mockUsers.find((user) => user._id === userId);

      if (!mockUser) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // Store the token with an expiration time
      mockVerificationTokens[`deletion:${userId}`] = {
        token,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours expiration
      };

      // In a real app, we would send an email with a confirmation link
      // For mock purposes, just return the token
      res.status(200).json({
        success: true,
        message: 'Account deletion confirmation email sent',
        token, // Only include this in mock/development mode
      });
      return;
    }

    // Get user from real database
    const user = await User.findById(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Generate a deletion confirmation token
    const token = crypto.randomBytes(20).toString('hex');

    // In a real implementation, store the token and send an email with a confirmation link

    // For now, just return success
    res.status(200).json({
      success: true,
      message: 'Account deletion confirmation email sent',
    });
  } catch (error: any) {
    console.error(`Error in requestAccountDeletion: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error requesting account deletion',
      error: error.message,
    });
  }
};

/**
 * @desc    Confirm account deletion with token
 * @route   DELETE /api/profile/confirm/:token
 * @access  Private
 */
export const confirmAccountDeletion = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token } = req.params;
    const userId = req.user?.id;

    if (usingMockDatabase) {
      // Check if token exists and is valid
      const key = `deletion:${userId}`;

      if (!mockVerificationTokens[key] || mockVerificationTokens[key].token !== token) {
        res.status(400).json({
          success: false,
          message: 'Invalid confirmation token',
        });
        return;
      }

      // Check if token is expired
      if (mockVerificationTokens[key].expires < new Date()) {
        // Remove expired token
        delete mockVerificationTokens[key];

        res.status(400).json({
          success: false,
          message: 'Confirmation token has expired',
        });
        return;
      }

      // Find the user index
      const mockUserIndex = mockUsers.findIndex((user) => user._id === userId);

      if (mockUserIndex === -1) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // Remove the user
      mockUsers.splice(mockUserIndex, 1);

      // Remove the used token
      delete mockVerificationTokens[key];

      res.status(200).json({
        success: true,
        message: 'Account successfully deleted',
      });
      return;
    }

    // In a real implementation, verify the token and delete the user
    const user = await User.findById(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Delete the user
    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: 'Account successfully deleted',
    });
  } catch (error: any) {
    console.error(`Error in confirmAccountDeletion: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error confirming account deletion',
      error: error.message,
    });
  }
};
