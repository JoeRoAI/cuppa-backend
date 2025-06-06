import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import config from '../config/config';
import logger from '../utils/logger';
import * as productSyncService from '../services/product-sync.service';
import { usingMockDatabase } from '../config/db';

/**
 * Verify webhook request authenticity
 * @param req Express request
 * @returns Boolean indicating if the webhook is authentic
 */
const verifyWebhook = (req: Request): boolean => {
  if (usingMockDatabase || process.env.NODE_ENV === 'development') {
    return true; // Skip verification in development/mock mode
  }

  try {
    const hmacHeader = req.headers['x-shopify-hmac-sha256'] as string;
    const body = req.body;

    if (!hmacHeader || !config.SHOPIFY_API_SECRET) {
      return false;
    }

    // Create a hash using the body and API secret
    const hash = crypto
      .createHmac('sha256', config.SHOPIFY_API_SECRET)
      .update(JSON.stringify(body), 'utf8')
      .digest('base64');

    // Compare our hash to Shopify's hash
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
  } catch (error) {
    logger.error('Error verifying webhook:', error);
    return false;
  }
};

/**
 * @desc    Handle product create/update webhook from Shopify
 * @route   POST /api/shopify/webhook/products
 * @access  Public (authenticated via HMAC)
 */
export const handleProductWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Verify the webhook is from Shopify
    if (!verifyWebhook(req)) {
      logger.warn('Unauthorized webhook attempt');
      res.status(401).send('Unauthorized');
      return;
    }

    // Get the webhook topic
    const topic = req.headers['x-shopify-topic'] as string;

    // Process based on topic
    if (topic.includes('products/create') || topic.includes('products/update')) {
      // Extract the product data from the webhook payload
      const shopifyProduct = req.body;

      // Transform to our expected format
      const transformedProduct = {
        id: `gid://shopify/Product/${shopifyProduct.id}`,
        title: shopifyProduct.title,
        handle: shopifyProduct.handle,
        description: shopifyProduct.body_html || '',
        variants: shopifyProduct.variants.map((variant: any) => ({
          id: `gid://shopify/ProductVariant/${variant.id}`,
          title: variant.title,
          price: {
            amount: variant.price.toString(),
            currencyCode: shopifyProduct.currency || 'USD',
          },
          available: variant.inventory_quantity > 0,
        })),
        images: shopifyProduct.images.map((image: any) => ({
          url: image.src,
        })),
      };

      // Sync the product to our database
      await productSyncService.syncProduct(transformedProduct);

      logger.info(`Processed ${topic} webhook for product ${shopifyProduct.id}`);
      res.status(200).send('OK');
    } else if (topic.includes('products/delete')) {
      // Handle product deletion
      const shopifyId = req.body.id.toString();

      // Delete from our database
      await productSyncService.deleteProductById(shopifyId);

      logger.info(`Processed ${topic} webhook for product ${shopifyId}`);
      res.status(200).send('OK');
    } else {
      // Unsupported topic
      logger.info(`Received unsupported webhook topic: ${topic}`);
      res.status(200).send('Ignored');
    }
  } catch (error) {
    logger.error(
      `Error handling product webhook: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    // Always return 200 to Shopify to prevent retries
    res.status(200).send('Error processed');
  }
};

/**
 * @desc    Handle inventory level update webhook from Shopify
 * @route   POST /api/shopify/webhook/inventory
 * @access  Public (authenticated via HMAC)
 */
export const handleInventoryWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Verify the webhook is from Shopify
    if (!verifyWebhook(req)) {
      logger.warn('Unauthorized inventory webhook attempt');
      res.status(401).send('Unauthorized');
      return;
    }

    // Get the webhook topic
    const topic = req.headers['x-shopify-topic'] as string;

    if (topic.includes('inventory_levels/update')) {
      // Extract inventory data
      const inventoryData = req.body;
      const variantId = inventoryData.inventory_item_id;

      // Update inventory for the variant
      await productSyncService.updateProductInventory(variantId, inventoryData.available);

      logger.info(`Processed ${topic} webhook for variant ${variantId}`);
      res.status(200).send('OK');
    } else {
      // Unsupported topic
      logger.info(`Received unsupported inventory webhook topic: ${topic}`);
      res.status(200).send('Ignored');
    }
  } catch (error) {
    logger.error(
      `Error handling inventory webhook: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    // Always return 200 to Shopify to prevent retries
    res.status(200).send('Error processed');
  }
};

/**
 * @desc    Register webhooks with Shopify
 * @route   POST /api/shopify/webhook/register
 * @access  Private (Admin)
 */
export const registerWebhooks = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get the base URL for webhook endpoints
    const host = req.get('host') || config.API_HOST || 'localhost:5001';
    const protocol = req.protocol || 'http';
    const baseUrl = `${protocol}://${host}/api/shopify/webhook`;

    // Define the webhooks to register
    const webhooks = [
      {
        topic: 'products/create',
        address: `${baseUrl}/products`,
        format: 'json',
      },
      {
        topic: 'products/update',
        address: `${baseUrl}/products`,
        format: 'json',
      },
      {
        topic: 'products/delete',
        address: `${baseUrl}/products`,
        format: 'json',
      },
      {
        topic: 'inventory_levels/update',
        address: `${baseUrl}/inventory`,
        format: 'json',
      },
    ];

    // Register webhooks with Shopify
    const shopifyService = await import('../services/shopify.service');
    const results = await shopifyService.registerShopifyWebhooks(webhooks);

    res.status(200).json({
      success: true,
      message: 'Webhook registration completed',
      results,
    });
  } catch (error) {
    logger.error(
      `Error registering webhooks: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    res.status(500).json({
      success: false,
      message: 'Error registering webhooks',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
