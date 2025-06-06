import { Request, Response, NextFunction } from 'express';
import {
  Guide,
  GuideCategory,
  GuideTag,
  IGuide,
  IGuideCategory,
  IGuideTag,
} from '../models/guide.model';
import { Bookmark, IBookmark } from '../models/bookmark.model';
import { IUser } from '../models/user.model';

// Interface for authenticated request
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

/**
 * @desc    Get all guide categories
 * @route   GET /api/education/categories
 * @access  Public
 */
export const getCategories = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const categories = await GuideCategory.find({ isActive: true })
      .sort({ order: 1, name: 1 })
      .select('-__v');

    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching categories',
    });
  }
};

/**
 * @desc    Get all guide tags
 * @route   GET /api/education/tags
 * @access  Public
 */
export const getTags = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tags = await GuideTag.find({ isActive: true }).sort({ name: 1 }).select('-__v');

    res.status(200).json({
      success: true,
      count: tags.length,
      data: tags,
    });
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tags',
    });
  }
};

/**
 * @desc    Get all guides with filtering, pagination, and search
 * @route   GET /api/education/guides
 * @access  Public
 */
export const getGuides = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      tags,
      difficulty,
      search,
      featured,
      sort = '-publishedAt',
    } = req.query;

    // Build query
    const query: any = { isPublished: true };

    if (category) {
      query.category = category;
    }

    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      query.tags = { $in: tagArray };
    }

    if (difficulty) {
      query.difficulty = difficulty;
    }

    if (featured === 'true') {
      query.isFeatured = true;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } },
      ];
    }

    // Pagination
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const guides = await Guide.find(query)
      .populate('category', 'name slug icon')
      .populate('tags', 'name slug color')
      .populate('author', 'name email')
      .select('-content -steps') // Exclude full content for list view
      .sort(sort as string)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const total = await Guide.countDocuments(query);

    res.status(200).json({
      success: true,
      count: guides.length,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      data: guides,
    });
  } catch (error) {
    console.error('Error fetching guides:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching guides',
    });
  }
};

/**
 * @desc    Get single guide by slug
 * @route   GET /api/education/guides/:slug
 * @access  Public
 */
export const getGuide = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { slug } = req.params;

    const guide = await Guide.findOne({ slug, isPublished: true })
      .populate('category', 'name slug icon')
      .populate('tags', 'name slug color')
      .populate('author', 'name email')
      .populate('relatedGuides', 'title slug excerpt featuredImage difficulty estimatedTime');

    if (!guide) {
      res.status(404).json({
        success: false,
        message: 'Guide not found',
      });
      return;
    }

    // Increment view count
    await Guide.findByIdAndUpdate(guide._id, { $inc: { viewCount: 1 } });

    res.status(200).json({
      success: true,
      data: guide,
    });
  } catch (error) {
    console.error('Error fetching guide:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching guide',
    });
  }
};

/**
 * @desc    Get featured guides
 * @route   GET /api/education/guides/featured
 * @access  Public
 */
export const getFeaturedGuides = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { limit = 6 } = req.query;

    const guides = await Guide.find({ isPublished: true, isFeatured: true })
      .populate('category', 'name slug icon')
      .populate('tags', 'name slug color')
      .select('-content -steps')
      .sort('-publishedAt')
      .limit(parseInt(limit as string, 10));

    res.status(200).json({
      success: true,
      count: guides.length,
      data: guides,
    });
  } catch (error) {
    console.error('Error fetching featured guides:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching featured guides',
    });
  }
};

/**
 * @desc    Get popular guides (by view count)
 * @route   GET /api/education/guides/popular
 * @access  Public
 */
export const getPopularGuides = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { limit = 6 } = req.query;

    const guides = await Guide.find({ isPublished: true })
      .populate('category', 'name slug icon')
      .populate('tags', 'name slug color')
      .select('-content -steps')
      .sort('-viewCount')
      .limit(parseInt(limit as string, 10));

    res.status(200).json({
      success: true,
      count: guides.length,
      data: guides,
    });
  } catch (error) {
    console.error('Error fetching popular guides:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching popular guides',
    });
  }
};

/**
 * @desc    Add bookmark
 * @route   POST /api/education/bookmarks
 * @access  Private
 */
export const addBookmark = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { guideId, notes } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    // Check if guide exists
    const guide = await Guide.findById(guideId);
    if (!guide) {
      res.status(404).json({
        success: false,
        message: 'Guide not found',
      });
      return;
    }

    // Check if bookmark already exists
    const existingBookmark = await Bookmark.findOne({
      user: userId,
      guide: guideId,
    });

    if (existingBookmark) {
      res.status(400).json({
        success: false,
        message: 'Guide already bookmarked',
      });
      return;
    }

    // Create bookmark
    const bookmark = await Bookmark.create({
      user: userId,
      guide: guideId,
      notes,
    });

    // Increment bookmark count on guide
    await Guide.findByIdAndUpdate(guideId, { $inc: { bookmarkCount: 1 } });

    res.status(201).json({
      success: true,
      data: bookmark,
    });
  } catch (error) {
    console.error('Error adding bookmark:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding bookmark',
    });
  }
};

/**
 * @desc    Remove bookmark
 * @route   DELETE /api/education/bookmarks/:guideId
 * @access  Private
 */
export const removeBookmark = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { guideId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const bookmark = await Bookmark.findOneAndDelete({
      user: userId,
      guide: guideId,
    });

    if (!bookmark) {
      res.status(404).json({
        success: false,
        message: 'Bookmark not found',
      });
      return;
    }

    // Decrement bookmark count on guide
    await Guide.findByIdAndUpdate(guideId, { $inc: { bookmarkCount: -1 } });

    res.status(200).json({
      success: true,
      message: 'Bookmark removed',
    });
  } catch (error) {
    console.error('Error removing bookmark:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing bookmark',
    });
  }
};

/**
 * @desc    Get user bookmarks
 * @route   GET /api/education/bookmarks
 * @access  Private
 */
export const getUserBookmarks = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { page = 1, limit = 10 } = req.query;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    // Pagination
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const bookmarks = await Bookmark.find({ user: userId })
      .populate({
        path: 'guide',
        select: 'title slug excerpt featuredImage difficulty estimatedTime category tags',
        populate: [
          { path: 'category', select: 'name slug icon' },
          { path: 'tags', select: 'name slug color' },
        ],
      })
      .sort('-bookmarkedAt')
      .skip(skip)
      .limit(limitNum);

    const total = await Bookmark.countDocuments({ user: userId });

    res.status(200).json({
      success: true,
      count: bookmarks.length,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      data: bookmarks,
    });
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bookmarks',
    });
  }
};

/**
 * @desc    Check if guide is bookmarked by user
 * @route   GET /api/education/bookmarks/check/:guideId
 * @access  Private
 */
export const checkBookmark = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { guideId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const bookmark = await Bookmark.findOne({
      user: userId,
      guide: guideId,
    });

    res.status(200).json({
      success: true,
      isBookmarked: !!bookmark,
    });
  } catch (error) {
    console.error('Error checking bookmark:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking bookmark',
    });
  }
};
