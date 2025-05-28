import { Request, Response, NextFunction } from 'express';
import productSyncService from '../services/product-sync.service';
import Coffee from '../models/coffee.model';
import { usingMockDatabase } from '../config/db';

/**
 * @desc    Sync products from Shopify to local database
 * @route   POST /api/product-sync/sync
 * @access  Private (Admin)
 */
export const syncProducts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const forceRefresh = req.body.forceRefresh === true;

    // Perform the synchronization
    const syncedProducts = await productSyncService.syncAllProducts(forceRefresh);

    // Delete products that no longer exist in Shopify
    const deletedCount = await productSyncService.deleteStaleCoffeeProducts();

    res.status(200).json({
      success: true,
      message: 'Product synchronization completed successfully',
      count: syncedProducts.length,
      deletedCount,
      data: syncedProducts.map((p) => ({
        id: p.shopifyProductId,
        title: p.title,
        price: p.price,
        currency: p.currency,
        available: p.available,
      })),
    });
  } catch (error: any) {
    console.error(`Error in syncProducts: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error during product synchronization',
      error: error.message,
    });
  }
};

/**
 * @desc    Get all synced coffee products
 * @route   GET /api/product-sync/products
 * @access  Private
 */
export const getSyncedProducts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (usingMockDatabase) {
      // For mock database, fetch products directly from Shopify service and transform them
      const shopifyProducts = await productSyncService.fetchProducts();
      const transformedProducts = await Promise.all(
        shopifyProducts.map((product) => productSyncService.syncProduct(product))
      );

      const filteredProducts = transformedProducts.filter((p) => p !== null);

      res.status(200).json({
        success: true,
        count: filteredProducts.length,
        data: filteredProducts,
      });
      return;
    }

    // For real database, fetch products from Coffee collection
    const coffeeProducts = await Coffee.find({ shopifyProductId: { $exists: true } }).sort({
      name: 1,
    });

    res.status(200).json({
      success: true,
      count: coffeeProducts.length,
      data: coffeeProducts,
    });
  } catch (error: any) {
    console.error(`Error in getSyncedProducts: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving synced products',
      error: error.message,
    });
  }
};

/**
 * @desc    Get a single synced coffee product by ID
 * @route   GET /api/product-sync/products/:id
 * @access  Private
 */
export const getSyncedProductById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    if (usingMockDatabase) {
      // For mock database, fetch products from Shopify service and find the matching one
      const shopifyProducts = await productSyncService.fetchProducts();
      const shopifyProduct = shopifyProducts.find(
        (p) => p.id.includes(`/Product/${id}`) || p.id === id
      );

      if (!shopifyProduct) {
        res.status(404).json({
          success: false,
          message: 'Product not found',
        });
        return;
      }

      const transformedProduct = await productSyncService.syncProduct(shopifyProduct);

      if (!transformedProduct) {
        res.status(404).json({
          success: false,
          message: 'Error transforming product',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: transformedProduct,
      });
      return;
    }

    // For real database, find product by Shopify ID in Coffee collection
    const coffeeProduct = await Coffee.findOne({
      $or: [{ shopifyProductId: id }, { _id: id }],
    });

    if (!coffeeProduct) {
      res.status(404).json({
        success: false,
        message: 'Product not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: coffeeProduct,
    });
  } catch (error: any) {
    console.error(`Error in getSyncedProductById: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving synced product',
      error: error.message,
    });
  }
};

/**
 * @desc    Initialize product sync on server startup
 */
export const initializeSync = async (): Promise<void> => {
  try {
    // Initial synchronization
    await productSyncService.initializeProductSync();
    
    // Set up automatic sync every 60 minutes (configurable via environment)
    const syncInterval = parseInt(process.env.SHOPIFY_SYNC_INTERVAL || '60', 10);
    productSyncService.setupSyncSchedule(syncInterval);
    
    console.log(`Product sync initialized. Automatic sync scheduled every ${syncInterval} minutes.`);
  } catch (error) {
    console.error('Failed to initialize product sync:', error);
  }
};
