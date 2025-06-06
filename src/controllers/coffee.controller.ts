import { Request, Response, NextFunction } from 'express';
import Coffee, { ICoffee } from '../models/coffee.model';
import { usingMockDatabase } from '../config/db';

// Mock data for development/testing
const mockCoffees: any[] = [];
let mockCoffeeId = 1;

/**
 * @desc    Get all coffees with optional filtering
 * @route   GET /api/coffee
 * @access  Public
 */
export const getCoffees = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract query parameters for filtering
    const {
      roastLevel,
      origin,
      category,
      minPrice,
      maxPrice,
      sortBy = 'createdAt',
      sortDirection = 'desc',
      limit = 10,
      page = 1,
    } = req.query;

    // Calculate pagination values
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Handle mock database mode
    if (usingMockDatabase) {
      // Apply filters to mock data
      let filteredCoffees = [...mockCoffees];

      if (roastLevel) {
        filteredCoffees = filteredCoffees.filter((coffee) => coffee.roastLevel === roastLevel);
      }

      if (origin) {
        filteredCoffees = filteredCoffees.filter((coffee) =>
          coffee.origin.country.toLowerCase().includes((origin as string).toLowerCase())
        );
      }

      if (category) {
        filteredCoffees = filteredCoffees.filter((coffee) => coffee.categories.includes(category));
      }

      if (minPrice) {
        const min = parseFloat(minPrice as string);
        filteredCoffees = filteredCoffees.filter((coffee) => {
          const lowestPrice = Math.min(...coffee.prices.map((p: any) => p.amount));
          return lowestPrice >= min;
        });
      }

      if (maxPrice) {
        const max = parseFloat(maxPrice as string);
        filteredCoffees = filteredCoffees.filter((coffee) => {
          const lowestPrice = Math.min(...coffee.prices.map((p: any) => p.amount));
          return lowestPrice <= max;
        });
      }

      // Sort the data
      filteredCoffees.sort((a, b) => {
        const sortField = sortBy as string;
        const direction = sortDirection === 'asc' ? 1 : -1;

        if (a[sortField] < b[sortField]) return -1 * direction;
        if (a[sortField] > b[sortField]) return 1 * direction;
        return 0;
      });

      // Apply pagination
      const paginatedCoffees = filteredCoffees.slice(skip, skip + limitNum);

      res.status(200).json({
        success: true,
        count: filteredCoffees.length,
        totalPages: Math.ceil(filteredCoffees.length / limitNum),
        page: pageNum,
        data: paginatedCoffees,
      });
      return;
    }

    // Build filter object for MongoDB query
    const filter: any = {};

    if (roastLevel) {
      filter.roastLevel = roastLevel;
    }

    if (origin) {
      filter['origin.country'] = { $regex: origin, $options: 'i' };
    }

    if (category) {
      filter.categories = category;
    }

    if (minPrice || maxPrice) {
      filter.prices = filter.prices || {};

      if (minPrice) {
        filter['prices.amount'] = { $gte: parseFloat(minPrice as string) };
      }

      if (maxPrice) {
        if (filter['prices.amount']) {
          filter['prices.amount'].$lte = parseFloat(maxPrice as string);
        } else {
          filter['prices.amount'] = { $lte: parseFloat(maxPrice as string) };
        }
      }
    }

    // Set up sort options
    const sortOptions: any = {};
    sortOptions[sortBy as string] = sortDirection === 'asc' ? 1 : -1;

    // Execute query with pagination
    const total = await Coffee.countDocuments(filter);
    const coffees = await Coffee.find(filter).sort(sortOptions).skip(skip).limit(limitNum);

    res.status(200).json({
      success: true,
      count: total,
      totalPages: Math.ceil(total / limitNum),
      page: pageNum,
      data: coffees,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving coffees',
      error: error.message,
    });
  }
};

/**
 * @desc    Get single coffee by ID
 * @route   GET /api/coffee/:id
 * @access  Public
 */
export const getCoffee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    // Handle mock database mode
    if (usingMockDatabase) {
      let mockCoffee;

      // Check if id is a numeric string (for mock DB) or not
      if (!isNaN(parseInt(id, 10))) {
        mockCoffee = mockCoffees.find((coffee) => coffee._id === id);
      } else {
        mockCoffee = mockCoffees.find((coffee) => coffee._id === id);
      }

      if (!mockCoffee) {
        res.status(404).json({
          success: false,
          message: 'Coffee not found with the provided ID',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: mockCoffee,
      });
      return;
    }

    // For real database
    const coffee = await Coffee.findById(id);

    if (!coffee) {
      res.status(404).json({
        success: false,
        message: 'Coffee not found with the provided ID',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: coffee,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving coffee',
      error: error.message,
    });
  }
};

/**
 * @desc    Create new coffee
 * @route   POST /api/coffee
 * @access  Private (Admin)
 */
export const createCoffee = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const coffeeData = req.body;

    // Basic validation
    if (
      !coffeeData.name ||
      !coffeeData.description ||
      !coffeeData.origin ||
      !coffeeData.roastLevel
    ) {
      res.status(400).json({
        success: false,
        message: 'Please provide all required fields: name, description, origin, and roastLevel',
      });
      return;
    }

    // Validate origin has country
    if (!coffeeData.origin.country) {
      res.status(400).json({
        success: false,
        message: 'Origin must include country',
      });
      return;
    }

    // Handle mock database mode
    if (usingMockDatabase) {
      const mockCoffee = {
        _id: `mock_coffee_${mockCoffeeId++}`,
        ...coffeeData,
        avgRating: 0,
        ratingCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCoffees.push(mockCoffee);

      res.status(201).json({
        success: true,
        data: mockCoffee,
      });
      return;
    }

    // For real database
    const coffee = await Coffee.create(coffeeData);

    res.status(201).json({
      success: true,
      data: coffee,
    });
  } catch (error: any) {
    // Handle validation errors from Mongoose
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err: any) => err.message);

      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating coffee',
      error: error.message,
    });
  }
};

/**
 * @desc    Update coffee
 * @route   PUT /api/coffee/:id
 * @access  Private (Admin)
 */
export const updateCoffee = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Handle mock database mode
    if (usingMockDatabase) {
      const index = mockCoffees.findIndex((coffee) => coffee._id === id);

      if (index === -1) {
        res.status(404).json({
          success: false,
          message: 'Coffee not found with the provided ID',
        });
        return;
      }

      // Update the mock coffee
      mockCoffees[index] = {
        ...mockCoffees[index],
        ...updateData,
        updatedAt: new Date(),
      };

      res.status(200).json({
        success: true,
        data: mockCoffees[index],
      });
      return;
    }

    // For real database
    const coffee = await Coffee.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!coffee) {
      res.status(404).json({
        success: false,
        message: 'Coffee not found with the provided ID',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: coffee,
    });
  } catch (error: any) {
    // Handle validation errors from Mongoose
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err: any) => err.message);

      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating coffee',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete coffee
 * @route   DELETE /api/coffee/:id
 * @access  Private (Admin)
 */
export const deleteCoffee = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    // Handle mock database mode
    if (usingMockDatabase) {
      const index = mockCoffees.findIndex((coffee) => coffee._id === id);

      if (index === -1) {
        res.status(404).json({
          success: false,
          message: 'Coffee not found with the provided ID',
        });
        return;
      }

      // Remove from the mock coffees array
      mockCoffees.splice(index, 1);

      res.status(200).json({
        success: true,
        data: {},
      });
      return;
    }

    // For real database
    const coffee = await Coffee.findByIdAndDelete(id);

    if (!coffee) {
      res.status(404).json({
        success: false,
        message: 'Coffee not found with the provided ID',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Server error while deleting coffee',
      error: error.message,
    });
  }
};

/**
 * @desc    Get coffee by barcode
 * @route   GET /api/coffee/barcode/:code
 * @access  Public
 * @param   {Request} req - Express request object with barcode in params
 * @param   {Response} res - Express response object
 * @param   {NextFunction} next - Express next function
 * @returns {Promise<void>} - JSON response with coffee data or error
 * @example
 *
 * // Example successful response:
 * {
 *   "success": true,
 *   "data": {
 *     "_id": "60d21b4667d0d8992e610c85",
 *     "name": "Ethiopian Yirgacheffe",
 *     "description": "...",
 *     "barcodes": ["1234567890123"],
 *     // other coffee fields
 *   }
 * }
 *
 * // Example error response (not found):
 * {
 *   "success": false,
 *   "message": "No coffee found with the provided barcode"
 * }
 */
export const getCoffeeByBarcode = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { code } = req.params;

    if (!code) {
      res.status(400).json({
        success: false,
        message: 'Please provide a valid barcode',
      });
      return;
    }

    // Handle mock database mode
    if (usingMockDatabase) {
      const mockCoffee = mockCoffees.find(
        (coffee) =>
          coffee.barcodes && Array.isArray(coffee.barcodes) && coffee.barcodes.includes(code)
      );

      if (!mockCoffee) {
        res.status(404).json({
          success: false,
          message: 'No coffee found with the provided barcode',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: mockCoffee,
      });
      return;
    }

    // For real database
    const coffee = await Coffee.findOne({ barcodes: code });

    if (!coffee) {
      res.status(404).json({
        success: false,
        message: 'No coffee found with the provided barcode',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: coffee,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving coffee by barcode',
      error: error.message,
    });
  }
};

/**
 * @desc    Bulk lookup coffees by multiple barcodes
 * @route   POST /api/coffee/barcode/bulk
 * @access  Public
 * @param   {Request} req - Express request object with barcodes array in body
 * @param   {Response} res - Express response object
 * @param   {NextFunction} next - Express next function
 * @returns {Promise<void>} - JSON response with lookup results
 * @example
 *
 * // Example request body:
 * {
 *   "barcodes": ["1234567890123", "1234567890124", "9876543210987"]
 * }
 *
 * // Example successful response:
 * {
 *   "success": true,
 *   "count": 2,
 *   "data": [
 *     {
 *       "barcode": "1234567890123",
 *       "found": true,
 *       "data": {
 *         "_id": "60d21b4667d0d8992e610c85",
 *         "name": "Ethiopian Yirgacheffe",
 *         // other coffee fields
 *       }
 *     },
 *     {
 *       "barcode": "1234567890124",
 *       "found": true,
 *       "data": {
 *         "_id": "60d21c1f67d0d8992e610c86",
 *         "name": "Colombian Supremo",
 *         // other coffee fields
 *       }
 *     },
 *     {
 *       "barcode": "9876543210987",
 *       "found": false,
 *       "data": null
 *     }
 *   ]
 * }
 *
 * // Example error response (invalid input):
 * {
 *   "success": false,
 *   "message": "Please provide an array of valid barcodes"
 * }
 */
export const bulkBarcodeLookup = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { barcodes } = req.body;

    if (!barcodes || !Array.isArray(barcodes) || barcodes.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Please provide an array of valid barcodes',
      });
      return;
    }

    // Handle mock database mode
    if (usingMockDatabase) {
      const results = barcodes.map((code) => {
        const coffee = mockCoffees.find(
          (coffee) =>
            coffee.barcodes && Array.isArray(coffee.barcodes) && coffee.barcodes.includes(code)
        );

        return {
          barcode: code,
          found: !!coffee,
          data: coffee || null,
        };
      });

      res.status(200).json({
        success: true,
        count: results.filter((r) => r.found).length,
        data: results,
      });
      return;
    }

    // For real database - use a single query to find all coffees with any of the barcodes
    const coffees = await Coffee.find({ barcodes: { $in: barcodes } });

    // Create a map for quick lookup
    const coffeeByBarcode = new Map();

    coffees.forEach((coffee) => {
      coffee.barcodes.forEach((code) => {
        if (barcodes.includes(code)) {
          coffeeByBarcode.set(code, coffee);
        }
      });
    });

    // Format the results
    const results = barcodes.map((code) => ({
      barcode: code,
      found: coffeeByBarcode.has(code),
      data: coffeeByBarcode.get(code) || null,
    }));

    res.status(200).json({
      success: true,
      count: results.filter((r) => r.found).length,
      data: results,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Server error during bulk barcode lookup',
      error: error.message,
    });
  }
};

/**
 * @desc    Get recommended coffees
 * @route   GET /api/coffee/recommended
 * @access  Public
 */
export const getRecommendedCoffees = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Handle mock database mode
    if (usingMockDatabase) {
      // Return mock recommended coffees
      const mockRecommendedCoffees = [
        {
          _id: 'rec1',
          name: 'Ethiopian Yirgacheffe',
          brand: 'Blue Bottle Coffee',
          roastLevel: 'Light',
          origin: { country: 'Ethiopia', region: 'Yirgacheffe' },
          flavorNotes: ['Floral', 'Citrus', 'Tea-like'],
          prices: [{ amount: 18.95, size: '12oz', unit: 'bag' }],
          categories: ['Single Origin', 'Light Roast'],
          rating: 4.8,
          description: 'A bright and floral coffee with citrus notes',
          imageUrl: '/images/coffee-placeholder.jpg',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: 'rec2',
          name: 'Colombian Supremo',
          brand: 'Stumptown Coffee',
          roastLevel: 'Medium',
          origin: { country: 'Colombia', region: 'Huila' },
          flavorNotes: ['Chocolate', 'Caramel', 'Nutty'],
          prices: [{ amount: 16.5, size: '12oz', unit: 'bag' }],
          categories: ['Single Origin', 'Medium Roast'],
          rating: 4.6,
          description: 'A well-balanced coffee with chocolate and caramel notes',
          imageUrl: '/images/coffee-placeholder.jpg',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: 'rec3',
          name: 'House Blend',
          brand: 'Intelligentsia Coffee',
          roastLevel: 'Medium-Dark',
          origin: { country: 'Blend', region: 'Various' },
          flavorNotes: ['Rich', 'Smooth', 'Balanced'],
          prices: [{ amount: 15.0, size: '12oz', unit: 'bag' }],
          categories: ['Blend', 'Medium-Dark Roast'],
          rating: 4.4,
          description: 'A rich and smooth house blend perfect for everyday drinking',
          imageUrl: '/images/coffee-placeholder.jpg',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      res.status(200).json({
        success: true,
        count: mockRecommendedCoffees.length,
        data: mockRecommendedCoffees,
      });
      return;
    }

    // For real database - get highly rated coffees or featured coffees
    const recommendedCoffees = await Coffee.find({
      $or: [{ rating: { $gte: 4.5 } }, { categories: { $in: ['Featured', 'Popular'] } }],
    })
      .sort({ rating: -1, createdAt: -1 })
      .limit(6);

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
