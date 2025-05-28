/**
 * checkin.controller.ts
 * Controller for coffee shop check-ins
 */
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import CheckIn from '../models/checkin.model';
import logger from '../utils/logger';

// Extend Express Request to include user
type AuthRequest = Request & {
  user: {
    id: string;
    name?: string;
    email?: string;
    role?: string;
    [key: string]: any; // Allow additional properties
  };
};

/**
 * Create a new check-in to a coffee shop
 * @route POST /api/shops/:shopId/check-in
 * @access Private
 */
export const createCheckIn = async (req: AuthRequest, res: Response) => {
  try {
    const { shopId } = req.params;
    const userId = req.user.id;

    if (!shopId) {
      return res.status(400).json({
        success: false,
        message: 'Shop ID is required',
      });
    }

    // Handle special case for "home" check-ins
    let actualShopId: mongoose.Types.ObjectId;
    
    if (shopId === 'home') {
      // Create a special ObjectId for home check-ins or use a default one
      // Using a consistent ObjectId for all home check-ins
      actualShopId = new mongoose.Types.ObjectId('000000000000000000000001');
    } else {
      // Validate that shopId is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(shopId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid shop ID format',
        });
      }
      actualShopId = new mongoose.Types.ObjectId(shopId);
    }

    // Create check-in document
    const checkInData = {
      userId,
      shopId: actualShopId,
      coffeeId: req.body.coffeeId ? new mongoose.Types.ObjectId(req.body.coffeeId) : undefined,
      purchasedItem: req.body.purchasedItem,
      notes: req.body.notes,
      images: req.body.images || [],
      location: req.body.location || (shopId === 'home' ? { type: 'Point', coordinates: [0, 0], address: 'Home' } : undefined),
      brewMethod: req.body.brewMethod,
      tags: req.body.tags || [],
      isPublic: req.body.isPublic !== undefined ? req.body.isPublic : true,
    };

    const checkIn = new CheckIn(checkInData);
    await checkIn.save();

    // Also track this as a user interaction for analytics
    if (req.app.locals.trackInteraction) {
      await req.app.locals.trackInteraction({
        userId,
        shopId: checkIn.shopId,
        coffeeId: checkIn.coffeeId,
        interactionType: 'checkin',
        value: 1,
        metadata: {
          checkInId: checkIn._id,
          brewMethod: checkIn.brewMethod,
          tags: checkIn.tags,
          isHomeCheckIn: shopId === 'home',
        },
      });
    }

    logger.info(`User ${userId} checked in to ${shopId === 'home' ? 'home' : `shop ${shopId}`}`);

    res.status(201).json({
      success: true,
      message: 'Check-in created successfully',
      data: checkIn,
    });
  } catch (error: any) {
    logger.error('Error creating check-in:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create check-in',
      error: error.message,
    });
  }
};

/**
 * Get all check-ins for a specific coffee shop
 * @route GET /api/shops/:shopId/check-ins
 * @access Public
 */
export const getShopCheckIns = async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    if (!shopId) {
      return res.status(400).json({
        success: false,
        message: 'Shop ID is required',
      });
    }

    // Get check-ins for the shop
    const checkIns = await CheckIn.find({ 
      shopId: new mongoose.Types.ObjectId(shopId),
      isPublic: true // Only return public check-ins
    })
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit))
      .populate('userId', 'name username profileImage')
      .populate('coffeeId', 'name roaster origin roastLevel')
      .lean();

    const total = await CheckIn.countDocuments({ 
      shopId: new mongoose.Types.ObjectId(shopId),
      isPublic: true
    });

    res.status(200).json({
      success: true,
      message: 'Shop check-ins retrieved successfully',
      data: {
        checkIns,
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: total > Number(offset) + Number(limit),
        },
      },
    });
  } catch (error: any) {
    logger.error('Error getting shop check-ins:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get shop check-ins',
      error: error.message,
    });
  }
};

/**
 * Get all check-ins for a specific user
 * @route GET /api/users/:userId/check-ins
 * @access Public
 */
export const getUserCheckIns = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    const currentUserId = (req as AuthRequest).user?.id; // May be undefined for non-authenticated requests

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }

    // Build query - show all public check-ins or all check-ins if user is viewing their own profile
    const query: any = {
      userId: new mongoose.Types.ObjectId(userId),
    };

    // If not the user's own profile, only show public check-ins
    if (userId !== currentUserId) {
      query.isPublic = true;
    }

    // Get check-ins for the user
    const checkIns = await CheckIn.find(query)
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit))
      .populate('shopId', 'name location images rating')
      .populate('coffeeId', 'name roaster origin roastLevel')
      .lean();

    const total = await CheckIn.countDocuments(query);

    res.status(200).json({
      success: true,
      message: 'User check-ins retrieved successfully',
      data: {
        checkIns,
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: total > Number(offset) + Number(limit),
        },
      },
    });
  } catch (error: any) {
    logger.error('Error getting user check-ins:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user check-ins',
      error: error.message,
    });
  }
};

/**
 * Delete a check-in
 * @route DELETE /api/check-ins/:checkInId
 * @access Private
 */
export const deleteCheckIn = async (req: AuthRequest, res: Response) => {
  try {
    const { checkInId } = req.params;
    const userId = req.user.id;

    // Find the check-in
    const checkIn = await CheckIn.findById(checkInId);

    if (!checkIn) {
      return res.status(404).json({
        success: false,
        message: 'Check-in not found',
      });
    }

    // Check if the user owns this check-in
    if (checkIn.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to delete this check-in',
      });
    }

    // Delete the check-in
    await checkIn.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Check-in deleted successfully',
    });
  } catch (error: any) {
    logger.error('Error deleting check-in:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete check-in',
      error: error.message,
    });
  }
};

/**
 * Update a check-in (partial update)
 * @route PATCH /api/check-ins/:checkInId
 * @access Private
 */
export const updateCheckIn = async (req: AuthRequest, res: Response) => {
  try {
    const { checkInId } = req.params;
    const userId = req.user.id;

    // Find the check-in
    const checkIn = await CheckIn.findById(checkInId);

    if (!checkIn) {
      return res.status(404).json({
        success: false,
        message: 'Check-in not found',
      });
    }

    // Check if the user owns this check-in
    if (checkIn.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to update this check-in',
      });
    }

    // Fields that can be updated
    const updatableFields = [
      'notes',
      'images',
      'brewMethod',
      'tags',
      'isPublic',
      'purchasedItem',
      'coffeeId',
    ];

    // Create update object with only allowed fields
    const updateData: any = {};
    for (const field of updatableFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    // Convert coffeeId to ObjectId if it exists
    if (updateData.coffeeId) {
      updateData.coffeeId = new mongoose.Types.ObjectId(updateData.coffeeId);
    }

    // Update the check-in
    const updatedCheckIn = await CheckIn.findByIdAndUpdate(
      checkInId,
      { $set: updateData },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Check-in updated successfully',
      data: updatedCheckIn,
    });
  } catch (error: any) {
    logger.error('Error updating check-in:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update check-in',
      error: error.message,
    });
  }
}; 