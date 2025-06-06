/**
 * rating.controller.ts
 * Controller for coffee rating functionalities
 */
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Rating from '../models/rating.model';
import Coffee from '../models/coffee.model';
import logger from '../utils/logger';

// Extend Express Request to include user
type AuthRequest = Request & {
  user: {
    id: string;
    [key: string]: any;
  };
};

/**
 * Rate a coffee
 * @route POST /api/coffee/:coffeeId/rate
 * @access Private
 */
export const rateCoffee = async (req: AuthRequest, res: Response) => {
  try {
    const { coffeeId } = req.params;
    const userId = req.user.id;

    if (!coffeeId) {
      return res.status(400).json({
        success: false,
        message: 'Coffee ID is required',
      });
    }

    // Check if the coffee exists
    const coffee = await Coffee.findById(coffeeId);
    if (!coffee) {
      return res.status(404).json({
        success: false,
        message: 'Coffee not found',
      });
    }

    // Check if user has already rated this coffee
    const existingRating = await Rating.findOne({
      userId,
      coffeeId,
    });

    // Extract rating data from request body
    const {
      overall,
      aroma,
      flavor,
      aftertaste,
      acidity,
      body,
      balance,
      uniformity,
      cleanCup,
      sweetness,
      comment,
      images,
      shopId,
      checkInId,
      isPublic = true,
    } = req.body;

    // Validate required fields
    if (!overall || overall < 1 || overall > 5) {
      return res.status(400).json({
        success: false,
        message: 'Overall rating is required and must be between 1 and 5',
      });
    }

    // If rating exists, update it
    if (existingRating) {
      const updatedRating = await Rating.findByIdAndUpdate(
        existingRating._id,
        {
          overall,
          aroma,
          flavor,
          aftertaste,
          acidity,
          body,
          balance,
          uniformity,
          cleanCup,
          sweetness,
          comment,
          images,
          shopId,
          checkInId,
          isPublic,
        },
        { new: true, runValidators: true }
      );

      // Update coffee's average rating
      await updateCoffeeAverageRating(coffeeId);

      return res.status(200).json({
        success: true,
        message: 'Rating updated successfully',
        data: updatedRating,
      });
    }

    // If rating doesn't exist, create a new one
    const newRating = await Rating.create({
      userId,
      coffeeId,
      overall,
      aroma,
      flavor,
      aftertaste,
      acidity,
      body,
      balance,
      uniformity,
      cleanCup,
      sweetness,
      comment,
      images,
      shopId,
      checkInId,
      isPublic,
    });

    // Update coffee's average rating
    await updateCoffeeAverageRating(coffeeId);

    res.status(201).json({
      success: true,
      message: 'Rating created successfully',
      data: newRating,
    });
  } catch (error: any) {
    logger.error(`Error rating coffee: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error rating coffee',
      error: error.message,
    });
  }
};

/**
 * Get coffee ratings
 * @route GET /api/coffee/:coffeeId/ratings
 * @access Public
 */
export const getCoffeeRatings = async (req: Request, res: Response) => {
  try {
    const { coffeeId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Validate coffeeId
    if (!coffeeId) {
      return res.status(400).json({
        success: false,
        message: 'Coffee ID is required',
      });
    }

    // Check if the coffee exists
    const coffee = await Coffee.findById(coffeeId);
    if (!coffee) {
      return res.status(404).json({
        success: false,
        message: 'Coffee not found',
      });
    }

    // Get public ratings for this coffee
    const ratings = await Rating.find({ coffeeId, isPublic: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name avatar'); // Populate user details

    // Get total count for pagination
    const total = await Rating.countDocuments({ coffeeId, isPublic: true });

    // Get aggregated stats about this coffee's ratings
    const stats = await Rating.aggregate([
      { $match: { coffeeId: new mongoose.Types.ObjectId(coffeeId), isPublic: true } },
      {
        $group: {
          _id: null,
          avgOverall: { $avg: '$overall' },
          avgAroma: { $avg: '$aroma' },
          avgFlavor: { $avg: '$flavor' },
          avgAftertaste: { $avg: '$aftertaste' },
          avgAcidity: { $avg: '$acidity' },
          avgBody: { $avg: '$body' },
          avgBalance: { $avg: '$balance' },
          avgUniformity: { $avg: '$uniformity' },
          avgCleanCup: { $avg: '$cleanCup' },
          avgSweetness: { $avg: '$sweetness' },
          count: { $sum: 1 },
          // Count ratings by stars for distribution
          oneStar: { $sum: { $cond: [{ $eq: ['$overall', 1] }, 1, 0] } },
          twoStar: { $sum: { $cond: [{ $eq: ['$overall', 2] }, 1, 0] } },
          threeStar: { $sum: { $cond: [{ $eq: ['$overall', 3] }, 1, 0] } },
          fourStar: { $sum: { $cond: [{ $eq: ['$overall', 4] }, 1, 0] } },
          fiveStar: { $sum: { $cond: [{ $eq: ['$overall', 5] }, 1, 0] } },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      count: ratings.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      stats: stats.length > 0 ? stats[0] : null,
      data: ratings,
    });
  } catch (error: any) {
    logger.error(`Error getting coffee ratings: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error getting coffee ratings',
      error: error.message,
    });
  }
};

/**
 * Get user ratings
 * @route GET /api/users/:userId/ratings
 * @access Private/Public (depends on implementation)
 */
export const getUserRatings = async (req: Request, res: Response) => {
  try {
    // If user is requesting their own ratings, use req.user.id
    // Otherwise use the userId from the params
    const userId = req.params.userId;
    let showPrivate = false;

    // If user is authenticated and requesting their own ratings
    const authUser = (req as AuthRequest).user;
    if (authUser && authUser.id === userId) {
      showPrivate = true; // Show private ratings too
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Build query
    const query: any = { userId };
    if (!showPrivate) {
      query.isPublic = true;
    }

    // Get user ratings
    const ratings = await Rating.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('coffeeId', 'name brand image'); // Populate coffee details

    // Get total count for pagination
    const total = await Rating.countDocuments(query);

    res.status(200).json({
      success: true,
      count: ratings.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: ratings,
    });
  } catch (error: any) {
    logger.error(`Error getting user ratings: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error getting user ratings',
      error: error.message,
    });
  }
};

/**
 * Update a rating
 * @route PUT /api/ratings/:ratingId
 * @access Private
 */
export const updateRating = async (req: AuthRequest, res: Response) => {
  try {
    const { ratingId } = req.params;
    const userId = req.user.id;

    // Find the rating
    const rating = await Rating.findById(ratingId);

    // Check if rating exists
    if (!rating) {
      return res.status(404).json({
        success: false,
        message: 'Rating not found',
      });
    }

    // Check if user owns the rating
    if (rating.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this rating',
      });
    }

    // Extract updatable fields from request body
    const {
      overall,
      aroma,
      flavor,
      aftertaste,
      acidity,
      body,
      balance,
      uniformity,
      cleanCup,
      sweetness,
      comment,
      images,
      isPublic,
    } = req.body;

    // Update the rating
    const updatedRating = await Rating.findByIdAndUpdate(
      ratingId,
      {
        overall,
        aroma,
        flavor,
        aftertaste,
        acidity,
        body,
        balance,
        uniformity,
        cleanCup,
        sweetness,
        comment,
        images,
        isPublic,
      },
      { new: true, runValidators: true }
    );

    // Update coffee's average rating
    await updateCoffeeAverageRating(rating.coffeeId.toString());

    res.status(200).json({
      success: true,
      message: 'Rating updated successfully',
      data: updatedRating,
    });
  } catch (error: any) {
    logger.error(`Error updating rating: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error updating rating',
      error: error.message,
    });
  }
};

/**
 * Delete a rating
 * @route DELETE /api/ratings/:ratingId
 * @access Private
 */
export const deleteRating = async (req: AuthRequest, res: Response) => {
  try {
    const { ratingId } = req.params;
    const userId = req.user.id;

    // Find the rating
    const rating = await Rating.findById(ratingId);

    // Check if rating exists
    if (!rating) {
      return res.status(404).json({
        success: false,
        message: 'Rating not found',
      });
    }

    // Check if user owns the rating
    if (rating.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this rating',
      });
    }

    // Store coffeeId for updating average
    const coffeeId = rating.coffeeId.toString();

    // Delete the rating
    await Rating.findByIdAndDelete(ratingId);

    // Update coffee's average rating
    await updateCoffeeAverageRating(coffeeId);

    res.status(200).json({
      success: true,
      message: 'Rating deleted successfully',
    });
  } catch (error: any) {
    logger.error(`Error deleting rating: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error deleting rating',
      error: error.message,
    });
  }
};

/**
 * Helper function to update a coffee's average rating
 */
const updateCoffeeAverageRating = async (coffeeId: string) => {
  try {
    // Calculate new average ratings
    const stats = await Rating.aggregate([
      { $match: { coffeeId: new mongoose.Types.ObjectId(coffeeId), isPublic: true } },
      {
        $group: {
          _id: null,
          avgOverall: { $avg: '$overall' },
          avgAroma: { $avg: '$aroma' },
          avgFlavor: { $avg: '$flavor' },
          avgAftertaste: { $avg: '$aftertaste' },
          avgAcidity: { $avg: '$acidity' },
          avgBody: { $avg: '$body' },
          avgBalance: { $avg: '$balance' },
          count: { $sum: 1 },
        },
      },
    ]);

    // Update the coffee document
    if (stats.length > 0) {
      await Coffee.findByIdAndUpdate(coffeeId, {
        rating: {
          count: stats[0].count,
          overall: stats[0].avgOverall,
          aroma: stats[0].avgAroma,
          flavor: stats[0].avgFlavor,
          aftertaste: stats[0].avgAftertaste,
          acidity: stats[0].avgAcidity,
          body: stats[0].avgBody,
          balance: stats[0].avgBalance,
        },
      });
    } else {
      // No ratings, reset to defaults
      await Coffee.findByIdAndUpdate(coffeeId, {
        rating: {
          count: 0,
          overall: 0,
          aroma: 0,
          flavor: 0,
          aftertaste: 0,
          acidity: 0,
          body: 0,
          balance: 0,
        },
      });
    }
  } catch (error) {
    logger.error(`Error updating coffee average rating: ${error}`);
    throw error;
  }
};
