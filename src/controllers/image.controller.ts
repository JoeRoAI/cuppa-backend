import { Request, Response, NextFunction } from 'express';
import User from '../models/user.model';
import Rating from '../models/rating.model';
import imageService from '../services/image.service';

interface AuthenticatedRequest extends Request {
  user?: any; // Use any to match the existing auth middleware
}

/**
 * Upload profile image
 * @route POST /api/images/profile
 * @access Private
 */
export const uploadProfileImage = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'No image file provided',
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    // Validate image
    const isValidImage = await imageService.validateImage(req.file.buffer);
    if (!isValidImage) {
      res.status(400).json({
        success: false,
        message: 'Invalid image file',
      });
      return;
    }

    // Process and save image
    const processedImage = await imageService.processProfileImage(
      req.file.buffer,
      req.file.originalname
    );

    // Update user profile with new image URL
    const user = await User.findById(req.user.id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Delete old profile image if exists
    if (user.profileImage) {
      const oldFilename = imageService.extractFilenameFromUrl(user.profileImage);
      if (oldFilename) {
        await imageService.deleteImage(oldFilename);
      }
    }

    // Update user with new profile image
    user.profileImage = processedImage.url;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile image uploaded successfully',
      data: {
        imageUrl: processedImage.url,
        publicId: processedImage.publicId,
        size: processedImage.size,
        dimensions: {
          width: processedImage.width,
          height: processedImage.height,
        },
      },
    });
  } catch (error) {
    console.error('Error uploading profile image:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while uploading image',
    });
  }
};

/**
 * Upload review images
 * @route POST /api/images/review/:ratingId
 * @access Private
 */
export const uploadReviewImages = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { ratingId } = req.params;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        message: 'No image files provided',
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    // Find the rating and verify ownership
    const rating = await Rating.findById(ratingId);
    if (!rating) {
      res.status(404).json({
        success: false,
        message: 'Rating not found',
      });
      return;
    }

    if (rating.userId.toString() !== req.user.id) {
      res.status(403).json({
        success: false,
        message: 'Not authorized to upload images for this rating',
      });
      return;
    }

    // Process all images
    const processedImages = [];
    for (const file of files) {
      // Validate each image
      const isValidImage = await imageService.validateImage(file.buffer);
      if (!isValidImage) {
        res.status(400).json({
          success: false,
          message: `Invalid image file: ${file.originalname}`,
        });
        return;
      }

      // Process and save image
      const processedImage = await imageService.processReviewImage(file.buffer, file.originalname);
      processedImages.push(processedImage);
    }

    // Update rating with new image URLs
    const imageUrls = processedImages.map((img) => img.url);
    rating.images = [...(rating.images || []), ...imageUrls];
    await rating.save();

    res.status(200).json({
      success: true,
      message: 'Review images uploaded successfully',
      data: {
        ratingId: rating._id,
        uploadedImages: processedImages.map((img) => ({
          url: img.url,
          publicId: img.publicId,
          size: img.size,
          dimensions: {
            width: img.width,
            height: img.height,
          },
        })),
        totalImages: rating.images.length,
      },
    });
  } catch (error) {
    console.error('Error uploading review images:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while uploading images',
    });
  }
};

/**
 * Delete profile image
 * @route DELETE /api/images/profile
 * @access Private
 */
export const deleteProfileImage = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    if (!user.profileImage) {
      res.status(400).json({
        success: false,
        message: 'No profile image to delete',
      });
      return;
    }

    // Delete image file
    const publicId = imageService.extractFilenameFromUrl(user.profileImage);
    if (publicId) {
      await imageService.deleteImage(publicId);
    }

    // Remove image URL from user profile
    user.profileImage = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile image deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting profile image:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting image',
    });
  }
};

/**
 * Delete review image
 * @route DELETE /api/images/review/:ratingId/:imageUrl
 * @access Private
 */
export const deleteReviewImage = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { ratingId, imageUrl } = req.params;
    const decodedImageUrl = decodeURIComponent(imageUrl);

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    // Find the rating and verify ownership
    const rating = await Rating.findById(ratingId);
    if (!rating) {
      res.status(404).json({
        success: false,
        message: 'Rating not found',
      });
      return;
    }

    if (rating.userId.toString() !== req.user.id) {
      res.status(403).json({
        success: false,
        message: 'Not authorized to delete images for this rating',
      });
      return;
    }

    // Check if image exists in rating
    if (!rating.images || !rating.images.includes(decodedImageUrl)) {
      res.status(404).json({
        success: false,
        message: 'Image not found in rating',
      });
      return;
    }

    // Delete image file
    const filename = imageService.extractFilenameFromUrl(decodedImageUrl);
    if (filename) {
      await imageService.deleteImage(filename);
    }

    // Remove image URL from rating
    rating.images = rating.images.filter((img) => img !== decodedImageUrl);
    await rating.save();

    res.status(200).json({
      success: true,
      message: 'Review image deleted successfully',
      data: {
        ratingId: rating._id,
        remainingImages: rating.images.length,
      },
    });
  } catch (error) {
    console.error('Error deleting review image:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting image',
    });
  }
};
