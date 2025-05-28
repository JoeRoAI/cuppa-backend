import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Coffee from '../models/coffee.model';
import Supplier from '../models/supplier.model';
import Rating from '../models/rating.model';
import Collection from '../models/collection.model';
import User from '../models/user.model';
import { usingMockDatabase } from '../config/db';

// Mock data for development/testing
const mockSuppliersMap = new Map();
const mockCollectionsMap = new Map();
const mockRatingsMap = new Map();

/**
 * @desc    Get coffee products by supplier ID
 * @route   GET /api/integration/supplier/:id/coffees
 * @access  Public
 */
export const getCoffeesBySupplier = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { limit = 10, page = 1 } = req.query;

    // Parse pagination parameters
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Handle mock database mode
    if (usingMockDatabase) {
      // Filter mock data
      const filteredCoffees = mockSuppliersMap.get(id) || [];
      const paginatedCoffees = filteredCoffees.slice(skip, skip + limitNum);

      res.status(200).json({
        success: true,
        count: filteredCoffees.length,
        page: pageNum,
        totalPages: Math.ceil(filteredCoffees.length / limitNum),
        data: paginatedCoffees,
      });
      return;
    }

    // Check if supplier exists first
    const supplier = await Supplier.findById(id);
    if (!supplier) {
      res.status(404).json({
        success: false,
        message: 'Supplier not found',
      });
      return;
    }

    // Get total count
    const total = await Coffee.countDocuments({ supplierId: id });

    // Get coffees with pagination
    const coffees = await Coffee.find({ supplierId: id })
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data: coffees,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving supplier coffees',
      error: error.message,
    });
  }
};

/**
 * @desc    Get coffees that are part of a collection
 * @route   GET /api/integration/collection/:id/coffees
 * @access  Public/Private (depends on collection visibility)
 */
export const getCoffeesByCollection = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { limit = 10, page = 1 } = req.query;

    // Parse pagination parameters
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Handle mock database mode
    if (usingMockDatabase) {
      // Filter mock data
      const filteredCoffees = mockCollectionsMap.get(id) || [];
      const paginatedCoffees = filteredCoffees.slice(skip, skip + limitNum);

      res.status(200).json({
        success: true,
        count: filteredCoffees.length,
        page: pageNum,
        totalPages: Math.ceil(filteredCoffees.length / limitNum),
        data: paginatedCoffees,
      });
      return;
    }

    // Find the collection first
    const collection = await Collection.findById(id);
    if (!collection) {
      res.status(404).json({
        success: false,
        message: 'Collection not found',
      });
      return;
    }

    // Check if collection is private and user is authorized
    if (!collection.isPublic) {
      // @ts-ignore
      const userId = req.user?._id;

      // If user is not authenticated or not the owner
      if (!userId || !userId.equals(collection.userId)) {
        res.status(403).json({
          success: false,
          message: 'Not authorized to access this private collection',
        });
        return;
      }
    }

    // Get coffees from collection with pagination
    const coffees = await Coffee.find({ _id: { $in: collection.coffees } })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      count: collection.coffees.length,
      page: pageNum,
      totalPages: Math.ceil(collection.coffees.length / limitNum),
      data: coffees,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving collection coffees',
      error: error.message,
    });
  }
};

/**
 * @desc    Get all ratings for a coffee
 * @route   GET /api/integration/coffee/:id/ratings
 * @access  Public
 */
export const getCoffeeRatings = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { limit = 10, page = 1 } = req.query;

    // Parse pagination parameters
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Handle mock database mode
    if (usingMockDatabase) {
      // Filter mock data
      const ratings = mockRatingsMap.get(id) || [];
      const paginatedRatings = ratings.slice(skip, skip + limitNum);

      res.status(200).json({
        success: true,
        count: ratings.length,
        page: pageNum,
        totalPages: Math.ceil(ratings.length / limitNum),
        data: paginatedRatings,
      });
      return;
    }

    // Check if coffee exists
    const coffee = await Coffee.findById(id);
    if (!coffee) {
      res.status(404).json({
        success: false,
        message: 'Coffee not found',
      });
      return;
    }

    // Get total count
    const total = await Rating.countDocuments({ coffeeId: id });

    // Get ratings with pagination
    const ratings = await Rating.find({ coffeeId: id })
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 })
      .populate('userId', 'name'); // Include user name

    res.status(200).json({
      success: true,
      count: total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data: ratings,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving coffee ratings',
      error: error.message,
    });
  }
};

/**
 * @desc    Get all collections that include a coffee
 * @route   GET /api/integration/coffee/:id/collections
 * @access  Public (Only returns public collections)
 */
export const getCoffeeCollections = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { limit = 10, page = 1 } = req.query;

    // Parse pagination parameters
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Handle mock database mode
    if (usingMockDatabase) {
      // For mock data, we would need a reverse lookup
      const collections = Array.from(mockCollectionsMap.entries())
        .filter(([_, coffees]) => coffees.some((coffee: any) => coffee._id === id))
        .map(([collectionId, _]) => ({ _id: collectionId }));

      const paginatedCollections = collections.slice(skip, skip + limitNum);

      res.status(200).json({
        success: true,
        count: collections.length,
        page: pageNum,
        totalPages: Math.ceil(collections.length / limitNum),
        data: paginatedCollections,
      });
      return;
    }

    // Check if coffee exists
    const coffee = await Coffee.findById(id);
    if (!coffee) {
      res.status(404).json({
        success: false,
        message: 'Coffee not found',
      });
      return;
    }

    // Get total count of public collections that include this coffee
    const total = await Collection.countDocuments({
      coffees: id,
      isPublic: true,
    });

    // Get collections with pagination
    const collections = await Collection.find({
      coffees: id,
      isPublic: true,
    })
      .skip(skip)
      .limit(limitNum)
      .sort({ upvotes: -1, createdAt: -1 })
      .populate('userId', 'name'); // Include user name

    res.status(200).json({
      success: true,
      count: total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data: collections,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving coffee collections',
      error: error.message,
    });
  }
};

/**
 * @desc    Get coffee with all related data (supplier, ratings, etc)
 * @route   GET /api/integration/coffee/:id/full
 * @access  Public
 */
export const getFullCoffeeDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    // Handle mock database mode
    if (usingMockDatabase) {
      // For mock data, we would need to combine data from different mock sources
      const coffee = await Coffee.findById(id);

      if (!coffee) {
        res.status(404).json({
          success: false,
          message: 'Coffee not found',
        });
        return;
      }

      // Get related data
      const supplier = mockSuppliersMap.get(coffee.supplierId) || null;
      const ratings = mockRatingsMap.get(id) || [];

      // Combine data
      const fullDetails = {
        ...coffee.toObject(),
        supplier,
        detailedRatings: ratings.slice(0, 5), // Just include a few ratings
      };

      res.status(200).json({
        success: true,
        data: fullDetails,
      });
      return;
    }

    // For real database, use Mongoose population
    const coffee = await Coffee.findById(id)
      .populate('supplierId', 'name location contactInfo specializations')
      .populate({
        path: 'detailedRatings',
        options: { limit: 5, sort: { createdAt: -1 } },
        populate: { path: 'userId', select: 'name' },
      });

    if (!coffee) {
      res.status(404).json({
        success: false,
        message: 'Coffee not found',
      });
      return;
    }

    // Get count of collections this coffee appears in
    const collectionCount = await Collection.countDocuments({
      coffees: id,
      isPublic: true,
    });

    // Create response object with additional details
    const responseData = {
      ...coffee.toObject(),
      collectionCount,
    };

    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving full coffee details',
      error: error.message,
    });
  }
};

/**
 * @desc    Associate a coffee with a supplier
 * @route   PUT /api/integration/coffee/:coffeeId/supplier/:supplierId
 * @access  Private (Admin)
 */
export const associateCoffeeWithSupplier = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { coffeeId, supplierId } = req.params;

    // Handle mock database mode
    if (usingMockDatabase) {
      const coffeeIndex =
        mockSuppliersMap.get(supplierId)?.findIndex((c: any) => c._id === coffeeId) ?? -1;

      if (coffeeIndex === -1) {
        // Add to mock suppliers map
        const coffeeList = mockSuppliersMap.get(supplierId) || [];
        coffeeList.push({ _id: coffeeId });
        mockSuppliersMap.set(supplierId, coffeeList);
      }

      res.status(200).json({
        success: true,
        message: 'Coffee associated with supplier successfully',
      });
      return;
    }

    // Check if both coffee and supplier exist
    const coffee = await Coffee.findById(coffeeId);
    if (!coffee) {
      res.status(404).json({
        success: false,
        message: 'Coffee not found',
      });
      return;
    }

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      res.status(404).json({
        success: false,
        message: 'Supplier not found',
      });
      return;
    }

    // Update coffee with supplier ID
    coffee.supplierId = supplier._id;
    await coffee.save();

    res.status(200).json({
      success: true,
      message: 'Coffee associated with supplier successfully',
      data: {
        coffee: {
          _id: coffee._id,
          name: coffee.name,
        },
        supplier: {
          _id: supplier._id,
          name: supplier.name,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Server error while associating coffee with supplier',
      error: error.message,
    });
  }
};

/**
 * @desc    Add coffee to a collection
 * @route   PUT /api/integration/collection/:collectionId/coffee/:coffeeId
 * @access  Private (Collection owner)
 */
export const addCoffeeToCollection = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { collectionId, coffeeId } = req.params;

    // Handle mock database mode
    if (usingMockDatabase) {
      const coffeeList = mockCollectionsMap.get(collectionId) || [];

      // Check if coffee is already in collection
      if (!coffeeList.some((c: any) => c._id === coffeeId)) {
        coffeeList.push({ _id: coffeeId });
        mockCollectionsMap.set(collectionId, coffeeList);
      }

      res.status(200).json({
        success: true,
        message: 'Coffee added to collection successfully',
      });
      return;
    }

    // Check if both coffee and collection exist
    const coffee = await Coffee.findById(coffeeId);
    if (!coffee) {
      res.status(404).json({
        success: false,
        message: 'Coffee not found',
      });
      return;
    }

    const collection = await Collection.findById(collectionId);
    if (!collection) {
      res.status(404).json({
        success: false,
        message: 'Collection not found',
      });
      return;
    }

    // Check if user is authorized to modify the collection
    // @ts-ignore
    const userId = req.user?._id;
    if (!userId || !userId.equals(collection.userId)) {
      res.status(403).json({
        success: false,
        message: 'Not authorized to modify this collection',
      });
      return;
    }

    // Check if coffee is already in collection
    if (collection.coffees.includes(coffee._id)) {
      res.status(400).json({
        success: false,
        message: 'Coffee is already in this collection',
      });
      return;
    }

    // Add coffee to collection
    collection.coffees.push(coffee._id);
    await collection.save();

    res.status(200).json({
      success: true,
      message: 'Coffee added to collection successfully',
      data: {
        collection: {
          _id: collection._id,
          name: collection.name,
        },
        coffee: {
          _id: coffee._id,
          name: coffee.name,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Server error while adding coffee to collection',
      error: error.message,
    });
  }
};

/**
 * @desc    Get supplier details with coffee count
 * @route   GET /api/integration/supplier/:id/details
 * @access  Public
 */
export const getSupplierWithCoffeeCount = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    // Handle mock database mode
    if (usingMockDatabase) {
      // For mock data, we would need direct lookups
      const supplier = await Supplier.findById(id);

      if (!supplier) {
        res.status(404).json({
          success: false,
          message: 'Supplier not found',
        });
        return;
      }

      const coffeeCount = mockSuppliersMap.get(id)?.length || 0;

      res.status(200).json({
        success: true,
        data: {
          ...supplier.toObject(),
          coffeeCount,
        },
      });
      return;
    }

    // Find supplier
    const supplier = await Supplier.findById(id);
    if (!supplier) {
      res.status(404).json({
        success: false,
        message: 'Supplier not found',
      });
      return;
    }

    // Get count of coffees by this supplier
    const coffeeCount = await Coffee.countDocuments({ supplierId: id });

    // Create response object
    const responseData = {
      ...supplier.toObject(),
      coffeeCount,
    };

    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving supplier details',
      error: error.message,
    });
  }
};

/**
 * @desc    Get recommended coffees based on user preferences
 * @route   GET /api/integration/recommendations
 * @access  Private
 */
export const getRecommendedCoffees = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // @ts-ignore
    const userId = req.user?._id;

    // Handle mock database mode
    if (usingMockDatabase) {
      // In mock mode, just return some random coffees
      const mockCoffees = await Coffee.find().limit(5);

      res.status(200).json({
        success: true,
        data: mockCoffees,
      });
      return;
    }

    // Get user to access their preferences
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Get user preferences
    const { roastLevel, flavorProfile } = user.preferences;

    // Build query based on user preferences
    const query: any = {};

    if (roastLevel && roastLevel.length > 0) {
      query.roastLevel = { $in: roastLevel };
    }

    if (flavorProfile && flavorProfile.length > 0) {
      query['flavorProfile.flavorNotes'] = { $in: flavorProfile };
    }

    // Get recommended coffees
    const recommendedCoffees = await Coffee.find(query).sort({ avgRating: -1 }).limit(10);

    res.status(200).json({
      success: true,
      count: recommendedCoffees.length,
      data: recommendedCoffees,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving recommended coffees',
      error: error.message,
    });
  }
};
