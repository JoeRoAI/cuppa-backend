import { usingMockDatabase } from '../config/db';
import shopifyService from './shopify.service';
import Coffee from '../models/coffee.model';
import { Types } from 'mongoose';

// Interface for product data from Shopify
interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  description: string;
  variants: Array<{
    id: string;
    title: string;
    price: { amount: string; currencyCode: string };
    available: boolean;
  }>;
  images: Array<{ url: string }>;
  [key: string]: any;
}

// Interface for synchronized coffee product
interface SyncedCoffeeProduct {
  shopifyProductId: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  available: boolean;
  handle: string;
  variantId: string;
  lastSynced: Date;
}

// Cache for products to reduce API calls
let productCache: { products: ShopifyProduct[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Fetch products from Shopify API or return cached products if available
 */
export const fetchProducts = async (forceRefresh = false): Promise<ShopifyProduct[]> => {
  // If we have cached products and they're not expired, return them
  const now = Date.now();
  if (productCache && !forceRefresh && now - productCache.timestamp < CACHE_TTL) {
    console.log('Returning products from cache');
    return productCache.products;
  }

  // Fetch fresh products from Shopify service
  try {
    const products = await shopifyService.fetchProducts();

    // Update cache
    productCache = {
      products,
      timestamp: now,
    };

    return products;
  } catch (error) {
    console.error('Error fetching products from Shopify:', error);

    // If there's an error but we have cached products, return them even if expired
    if (productCache) {
      console.log('Error fetching products, returning expired cache');
      return productCache.products;
    }

    // If no cache is available, throw the error
    throw error;
  }
};

/**
 * Sync a single product from Shopify to the local database
 */
export const syncProduct = async (
  shopifyProduct: ShopifyProduct
): Promise<SyncedCoffeeProduct | null> => {
  if (usingMockDatabase) {
    // For mock database, just transform the Shopify product data
    const variant = shopifyProduct.variants[0] || {
      id: 'default-variant',
      title: 'Default',
      price: { amount: '0.00', currencyCode: 'USD' },
      available: false,
    };

    return {
      shopifyProductId: shopifyProduct.id,
      title: shopifyProduct.title,
      description: shopifyProduct.description,
      price: parseFloat(variant.price.amount),
      currency: variant.price.currencyCode,
      imageUrl: shopifyProduct.images[0]?.url || '',
      available: variant.available,
      handle: shopifyProduct.handle,
      variantId: variant.id,
      lastSynced: new Date(),
    };
  }

  try {
    // Extract Shopify product ID from the GraphQL ID (format: gid://shopify/Product/1234567890)
    const shopifyIdMatch = shopifyProduct.id.match(/(\d+)$/);
    const shopifyId = shopifyIdMatch ? shopifyIdMatch[1] : shopifyProduct.id;

    // Use the first variant by default
    const variant = shopifyProduct.variants[0] || {
      id: 'default-variant',
      title: 'Default',
      price: { amount: '0.00', currencyCode: 'USD' },
      available: false,
    };

    // Check if coffee product already exists with this Shopify ID
    let coffeeProduct = await Coffee.findOne({ shopifyProductId: shopifyId });

    // Map Shopify product data to our Coffee model
    const originInfo = extractOriginFromTitle(shopifyProduct.title);
    const coffeeData = {
      name: shopifyProduct.title,
      description: shopifyProduct.description,
      origin: {
        country: 'Unknown', // Default value for required field
        region: originInfo.region,
      },
      roastLevel: extractRoastLevelFromDescription(shopifyProduct.description).toLowerCase(), // Convert to lowercase to match enum
      processingDetails: {
        method: 'washed', // Default value for required field
      },
      sku: `SHOP-${shopifyId}`, // Default SKU using Shopify ID
      prices: [
        {
          // Default price object to satisfy validation
          amount: parseFloat(variant.price.amount),
          currency: variant.price.currencyCode,
          size: '12',
          unit: 'oz',
        },
      ],
      price: parseFloat(variant.price.amount),
      currency: variant.price.currencyCode,
      shopifyProductId: shopifyId,
      shopifyVariantId: extractVariantId(variant.id),
      imageUrl: shopifyProduct.images[0]?.url || '',
      available: variant.available,
      shopifyHandle: shopifyProduct.handle,
      lastSynced: new Date(),
    };

    if (coffeeProduct) {
      // Update existing product
      Object.assign(coffeeProduct, coffeeData);
      await coffeeProduct.save({ validateBeforeSave: false });
    } else {
      // Create new product
      coffeeProduct = new Coffee(coffeeData);
      await coffeeProduct.save({ validateBeforeSave: false });
    }

    return {
      shopifyProductId: shopifyProduct.id,
      title: shopifyProduct.title,
      description: shopifyProduct.description,
      price: parseFloat(variant.price.amount),
      currency: variant.price.currencyCode,
      imageUrl: shopifyProduct.images[0]?.url || '',
      available: variant.available,
      handle: shopifyProduct.handle,
      variantId: variant.id,
      lastSynced: new Date(),
    };
  } catch (error) {
    console.error(`Error syncing product ${shopifyProduct.id}:`, error);
    return null;
  }
};

/**
 * Sync all products from Shopify to the local database
 */
export const syncAllProducts = async (forceRefresh = false): Promise<SyncedCoffeeProduct[]> => {
  try {
    // Fetch products from Shopify
    const shopifyProducts = await fetchProducts(forceRefresh);

    // Sync each product
    const syncPromises = shopifyProducts.map((product) => syncProduct(product));
    const syncedProducts = await Promise.all(syncPromises);

    // Filter out failed syncs (null values)
    return syncedProducts.filter((product): product is SyncedCoffeeProduct => product !== null);
  } catch (error) {
    console.error('Error syncing all products:', error);
    throw error;
  }
};

/**
 * Delete products that exist in the database but not in Shopify
 */
export const deleteStaleCoffeeProducts = async (): Promise<number> => {
  if (usingMockDatabase) {
    console.log('Mock database in use, skipping delete operation');
    return 0;
  }

  try {
    // Fetch current Shopify product IDs
    const shopifyProducts = await fetchProducts(true);
    const shopifyProductIds = shopifyProducts.map((p) => {
      const match = p.id.match(/(\d+)$/);
      return match ? match[1] : p.id;
    });

    // Find coffee products that don't have matching Shopify IDs
    const staleProducts = await Coffee.find({
      shopifyProductId: { $exists: true, $nin: shopifyProductIds },
    });

    if (staleProducts.length === 0) {
      return 0;
    }

    // Delete stale products
    await Coffee.deleteMany({
      shopifyProductId: { $exists: true, $nin: shopifyProductIds },
    });

    return staleProducts.length;
  } catch (error) {
    console.error('Error deleting stale coffee products:', error);
    throw error;
  }
};

/**
 * Delete a specific product by Shopify ID
 */
export const deleteProductById = async (shopifyId: string): Promise<boolean> => {
  if (usingMockDatabase) {
    console.log('Mock database in use, skipping delete operation');
    return true;
  }

  try {
    // Extract numeric ID if in GraphQL ID format
    const idMatch = shopifyId.match(/(\d+)$/);
    const normalizedId = idMatch ? idMatch[1] : shopifyId;

    // Delete the product
    const result = await Coffee.deleteOne({ shopifyProductId: normalizedId });

    return result.deletedCount > 0;
  } catch (error) {
    console.error(`Error deleting product ${shopifyId}:`, error);
    return false;
  }
};

/**
 * Update inventory for a specific product variant
 */
export const updateProductInventory = async (
  variantId: string,
  available: boolean
): Promise<boolean> => {
  if (usingMockDatabase) {
    console.log('Mock database in use, skipping inventory update');
    return true;
  }

  try {
    // Extract numeric ID if in GraphQL ID format
    const idMatch = variantId.match(/(\d+)$/);
    const normalizedId = idMatch ? idMatch[1] : variantId;

    // Update the product variant's inventory status
    const result = await Coffee.updateOne(
      { shopifyVariantId: normalizedId },
      {
        $set: {
          available,
          lastSynced: new Date(),
        },
      }
    );

    return result.modifiedCount > 0;
  } catch (error) {
    console.error(`Error updating inventory for variant ${variantId}:`, error);
    return false;
  }
};

/**
 * Initialize product synchronization
 */
export const initializeProductSync = async (): Promise<void> => {
  try {
    if (!usingMockDatabase) {
      console.log('Initializing product synchronization with Shopify...');
      await syncAllProducts(true);
      const deletedCount = await deleteStaleCoffeeProducts();
      console.log(`Sync complete. Deleted ${deletedCount} stale products.`);
    }
  } catch (error) {
    console.error('Error initializing product sync:', error);
  }
};

/**
 * Setup automatic synchronization schedule
 * @param intervalMinutes How often to sync in minutes
 */
export const setupSyncSchedule = (intervalMinutes = 60): NodeJS.Timeout => {
  console.log(`Setting up automatic product sync every ${intervalMinutes} minutes`);

  // Convert minutes to milliseconds
  const interval = intervalMinutes * 60 * 1000;

  // Initial sync
  setTimeout(async () => {
    try {
      await syncAllProducts(true);
      await deleteStaleCoffeeProducts();
      console.log('Scheduled product sync completed successfully');
    } catch (error) {
      console.error('Error in scheduled product sync:', error);
    }
  }, 10000); // Wait 10 seconds after server start for initial sync

  // Return the interval timer
  return setInterval(async () => {
    try {
      await syncAllProducts(true);
      await deleteStaleCoffeeProducts();
      console.log('Scheduled product sync completed successfully');
    } catch (error) {
      console.error('Error in scheduled product sync:', error);
    }
  }, interval);
};

function extractOriginFromTitle(title: string): { region?: string } {
  // Try to extract region information from the title
  const regionMatches = title.match(
    /(Ethiopian|Colombian|Brazilian|Kenyan|Rwandan|Costa Rican|Guatemalan|Peruvian|Indonesian|Vietnamese|Sumatran|Javan)/i
  );

  if (regionMatches && regionMatches[1]) {
    return { region: regionMatches[1] };
  }

  return {};
}

function extractRoastLevelFromDescription(description: string): string {
  // Default roast level
  let roastLevel = 'medium';

  // Try to extract roast level from description
  if (/light roast/i.test(description)) {
    roastLevel = 'light';
  } else if (/medium-light roast/i.test(description)) {
    roastLevel = 'medium-light';
  } else if (/medium roast/i.test(description)) {
    roastLevel = 'medium';
  } else if (/medium-dark roast/i.test(description)) {
    roastLevel = 'medium-dark';
  } else if (/dark roast/i.test(description)) {
    roastLevel = 'dark';
  } else if (/extra-dark|french/i.test(description)) {
    roastLevel = 'extra-dark';
  }

  return roastLevel;
}

function extractVariantId(variantId: string): string {
  // Extract variant ID from the GraphQL ID (format: gid://shopify/ProductVariant/1234567890)
  const match = variantId.match(/(\d+)$/);
  return match ? match[1] : variantId;
}

const productSyncService = {
  fetchProducts,
  syncProduct,
  syncAllProducts,
  deleteStaleCoffeeProducts,
  deleteProductById,
  updateProductInventory,
  initializeProductSync,
  setupSyncSchedule,
};

export default productSyncService;
