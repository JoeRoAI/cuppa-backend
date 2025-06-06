/**
 * shopify.service.ts
 * Service for Shopify e-commerce integration
 *
 * Features:
 * - Secure OAuth 2.0 authentication flow
 * - Encrypted token storage
 * - Graceful degradation when credentials are missing
 * - Rate limit handling
 * - Mock data for development
 */

import { shopifyApi, ApiVersion, LATEST_API_VERSION, Session } from '@shopify/shopify-api';
import config from '../config/config';
import { usingMockDatabase } from '../config/db';
import logger from '../utils/logger';
import TokenStorage from '../utils/token-storage.service';

// Define custom error types for Shopify
// This is used as a fallback if @shopify/shopify-api/lib/error cannot be imported
class ShopifyErrors {
  static HttpResponseError = class HttpResponseError extends Error {
    response: {
      code: number;
      headers: Record<string, string | string[] | undefined>;
    };

    constructor(
      message: string,
      response: { code: number; headers: Record<string, string | string[] | undefined> }
    ) {
      super(message);
      this.name = 'HttpResponseError';
      this.response = response;
    }
  };
}

// Constants for rate limiting and retry
const RATE_LIMIT_DELAY_MS = 1000; // 1 second delay before retry on rate limit
const MAX_RETRY_ATTEMPTS = 3;

// Create a namespace for Shopify-specific types
export namespace ShopifyTypes {
  // Product interfaces matching Shopify's API response structure
  export interface ShopifyPrice {
    amount: string;
    currencyCode: string;
  }

  export interface ShopifyVariant {
    id: string;
    title: string;
    price: ShopifyPrice;
    available: boolean;
  }

  export interface ShopifyImage {
    url: string;
  }

  export interface ShopifyProduct {
    id: string;
    title: string;
    handle: string;
    description: string;
    variants: ShopifyVariant[];
    images: ShopifyImage[];
  }

  // Rate limit tracking interface
  export interface RateLimitInfo {
    available: number;
    maxRequests: number;
    restoreRate: number;
    requestedAt: Date;
  }
}

// Mock Shopify products for development environment or when credentials are missing
export const mockShopifyProducts: ShopifyTypes.ShopifyProduct[] = [
  {
    id: 'gid://shopify/Product/1',
    title: 'Ethiopian Yirgacheffe',
    handle: 'ethiopian-yirgacheffe',
    description: 'A bright and fruity coffee with complex flavors.',
    variants: [
      {
        id: 'gid://shopify/ProductVariant/1',
        title: '12oz Bag',
        price: { amount: '14.99', currencyCode: 'USD' },
        available: true,
      },
    ],
    images: [{ url: 'https://example.com/images/ethiopian-yirgacheffe.jpg' }],
  },
  {
    id: 'gid://shopify/Product/2',
    title: 'Colombian Supremo',
    handle: 'colombian-supremo',
    description: 'Medium bodied with caramel and nutty notes.',
    variants: [
      {
        id: 'gid://shopify/ProductVariant/2',
        title: '12oz Bag',
        price: { amount: '13.99', currencyCode: 'USD' },
        available: true,
      },
    ],
    images: [{ url: 'https://example.com/images/colombian-supremo.jpg' }],
  },
];

// Cache for rate limit info to prevent excessive API calls
const rateLimitCache: Record<string, ShopifyTypes.RateLimitInfo> = {};

// Helper to check if Shopify is enabled
const isShopifyEnabled = (): boolean => {
  return Boolean(config.SHOPIFY_API_KEY && config.SHOPIFY_API_SECRET && config.SHOPIFY_STORE_URL);
};

// Helper to check if we're in development mode
const isDevelopment = (): boolean => {
  return config.NODE_ENV === 'development';
};

// Helper to check if we're in production mode
const isProduction = (): boolean => {
  return config.NODE_ENV === 'production';
};

/**
 * Initialize the Shopify API client
 * Uses environment variables and handles missing credentials gracefully
 */
const initShopifyApi = () => {
  try {
    // If Shopify integration is disabled in config, return null
    if (!isShopifyEnabled()) {
      if (isDevelopment()) {
        logger.warn('Shopify API credentials are missing. Using mock data for development.');
      } else {
        logger.error('Shopify API credentials are missing. Integration will be disabled.');
      }
      return null;
    }

    // Default scopes if not provided
    const defaultScopes = 'read_products,write_products,read_orders';

    // Initialize the Shopify API client with validated config
    const shopify = shopifyApi({
      apiKey: config.SHOPIFY_API_KEY!,
      apiSecretKey: config.SHOPIFY_API_SECRET!,
      scopes: (process.env.SHOPIFY_SCOPES || defaultScopes).split(','),
      hostName: new URL(config.SHOPIFY_STORE_URL!).hostname,
      apiVersion: LATEST_API_VERSION,
      isEmbeddedApp: false,
      // Add OAuth callback URL for web integration
      hostScheme: 'https',
      logger: {
        log: (severity: any, message: string) => {
          // Convert Shopify severity to our logger levels
          switch (severity) {
            case 'error':
              logger.error('Shopify API: ' + message);
              break;
            case 'warning':
              logger.warn('Shopify API: ' + message);
              break;
            case 'info':
              logger.info('Shopify API: ' + message);
              break;
            default:
              logger.debug('Shopify API: ' + message);
          }
        },
      },
    });

    logger.info(`Shopify API initialized successfully with API version ${LATEST_API_VERSION}`);
    return shopify;
  } catch (error) {
    logger.error(
      'Error initializing Shopify API:',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
};

// Singleton instance
let shopifyInstance: ReturnType<typeof shopifyApi> | null = null;

/**
 * Get or initialize the Shopify API instance
 * @returns The Shopify API instance or null if initialization failed
 */
export const getShopifyApi = () => {
  if (!shopifyInstance) {
    shopifyInstance = initShopifyApi();
  }
  return shopifyInstance;
};

/**
 * Create a custom session object that meets Shopify API requirements
 * @param shop The shop domain
 * @param accessToken The access token
 * @returns A Shopify session object
 */
const createCustomSession = (shop: string, accessToken: string): Session => {
  return new Session({
    id: `${shop}_${Date.now()}`,
    shop,
    state: '',
    isOnline: false,
    accessToken,
  });
};

/**
 * Retrieve a stored access token for a shop
 * @param shop The shop domain
 * @returns The access token if found, or undefined
 */
const getStoredAccessToken = async (shop: string): Promise<string | undefined> => {
  try {
    // Try to get from token storage service
    const token = await TokenStorage.getToken(`shopify_${shop}`);
    return token;
  } catch (error) {
    logger.warn(
      'Error retrieving Shopify access token:',
      error instanceof Error ? error.message : String(error)
    );
    return undefined;
  }
};

/**
 * Store an access token for a shop
 * @param shop The shop domain
 * @param accessToken The access token to store
 */
export const storeAccessToken = async (shop: string, accessToken: string): Promise<void> => {
  try {
    await TokenStorage.saveToken(`shopify_${shop}`, accessToken);
    logger.info(`Stored Shopify access token for ${shop}`);
  } catch (error) {
    logger.error(
      'Error storing Shopify access token:',
      error instanceof Error ? error.message : String(error)
    );
  }
};

/**
 * Handles and tracks rate limits for Shopify API calls
 * @param endpoint The API endpoint being called
 * @param headers Response headers from a Shopify API call
 */
const trackRateLimits = (
  endpoint: string,
  headers: Record<string, string | string[] | undefined>
) => {
  try {
    const available = parseInt(
      headers['x-shopify-shop-api-call-limit']?.toString().split('/')[0] || '0'
    );
    const maxRequests = parseInt(
      headers['x-shopify-shop-api-call-limit']?.toString().split('/')[1] || '40'
    );

    // Store rate limit info in cache
    rateLimitCache[endpoint] = {
      available,
      maxRequests,
      restoreRate: 0.5, // Shopify typically restores at 2 calls per second
      requestedAt: new Date(),
    };

    // Log warning if approaching limit
    if (available < maxRequests * 0.1) {
      logger.warn(
        `Shopify API rate limit approaching for ${endpoint}: ${available}/${maxRequests} remaining`
      );
    }
  } catch (error) {
    logger.warn(
      'Error tracking Shopify rate limits:',
      error instanceof Error ? error.message : String(error)
    );
  }
};

/**
 * Check if we should delay a request based on rate limits
 * @param endpoint The API endpoint to check
 * @returns The number of milliseconds to delay, or 0 if no delay needed
 */
const getRateLimitDelay = (endpoint: string): number => {
  const info = rateLimitCache[endpoint];
  if (!info) {
    return 0;
  }

  // If we're close to the limit, calculate delay
  if (info.available < info.maxRequests * 0.05) {
    const elapsedMs = new Date().getTime() - info.requestedAt.getTime();
    const requestsRestored = Math.floor((elapsedMs / 1000) * info.restoreRate);

    if (requestsRestored < 1) {
      // Calculate how long to wait for at least one request to be restored
      return Math.max(0, Math.ceil(1000 / info.restoreRate) - elapsedMs);
    }
  }

  return 0;
};

/**
 * Helper to create REST client with retry logic and proper error handling
 * @returns A Shopify REST client or null if unavailable
 */
export const createAdminRestClient = async () => {
  const shopify = getShopifyApi();

  // Return null if Shopify is disabled or using mock database
  if (!shopify || usingMockDatabase) {
    return null;
  }

  try {
    // Get shop domain from store URL
    const shop = new URL(config.SHOPIFY_STORE_URL || '').hostname;

    // Try to get stored access token
    let accessToken = await getStoredAccessToken(shop);

    // Fall back to environment variable if no stored token
    if (!accessToken) {
      accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

      // If token from env var exists, store it for future use
      if (accessToken) {
        await storeAccessToken(shop, accessToken);
      }
    }

    // If no access token available, return null
    if (!accessToken) {
      logger.warn('Shopify access token is missing. REST client cannot be created.');
      return null;
    }

    // Create session and client
    const session = createCustomSession(shop, accessToken);
    const client = new shopify.clients.Rest({
      session,
    });

    // Return the client with proper method exposure
    return {
      get: async (params: any) => {
        const response = await client.get(params);
        if (response.headers) {
          trackRateLimits(params.path, response.headers);
        }
        return response;
      },
      post: async (params: any) => {
        const response = await client.post(params);
        if (response.headers) {
          trackRateLimits(params.path, response.headers);
        }
        return response;
      },
      put: async (params: any) => {
        const response = await client.put(params);
        if (response.headers) {
          trackRateLimits(params.path, response.headers);
        }
        return response;
      },
      delete: async (params: any) => {
        const response = await client.delete(params);
        if (response.headers) {
          trackRateLimits(params.path, response.headers);
        }
        return response;
      },
    };
  } catch (error) {
    logger.error(
      'Error creating Shopify REST client:',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
};

/**
 * Helper to create GraphQL client with retry logic and proper error handling
 * @returns A Shopify GraphQL client or null if unavailable
 */
export const createAdminGraphQLClient = async () => {
  const shopify = getShopifyApi();

  // Return null if Shopify is disabled or using mock database
  if (!shopify || usingMockDatabase) {
    return null;
  }

  try {
    // Get shop domain from store URL
    const shop = new URL(config.SHOPIFY_STORE_URL || '').hostname;

    // Try to get stored access token
    let accessToken = await getStoredAccessToken(shop);

    // Fall back to environment variable if no stored token
    if (!accessToken) {
      accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

      // If token from env var exists, store it for future use
      if (accessToken) {
        await storeAccessToken(shop, accessToken);
      }
    }

    // If no access token available, return null
    if (!accessToken) {
      logger.warn('Shopify access token is missing. GraphQL client cannot be created.');
      return null;
    }

    // Create session and client
    const session = createCustomSession(shop, accessToken);
    const client = new shopify.clients.Graphql({
      session,
    });

    // Return the client with proper method exposure
    return {
      query: async (params: any) => {
        const response = await client.query(params);
        if (response.headers) {
          trackRateLimits(params.query || 'graphql', response.headers);
        }
        return response;
      },
    };
  } catch (error) {
    logger.error(
      'Error creating Shopify GraphQL client:',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
};

/**
 * Fetch products from Shopify with retry logic and rate limit handling
 * @returns Array of Shopify products
 */
export const fetchShopifyProducts = async (): Promise<ShopifyTypes.ShopifyProduct[]> => {
  // Use mock data in development mode or when using mock database
  if (usingMockDatabase || (!isShopifyEnabled() && isDevelopment())) {
    logger.debug('Using mock Shopify products data');
    return mockShopifyProducts;
  }

  // In production, if Shopify is disabled, return empty array
  if (!isShopifyEnabled() && isProduction()) {
    logger.error('Shopify integration is disabled in production. No products available.');
    return [];
  }

  // Get REST client with authenticated session
  const client = await createAdminRestClient();

  // If client creation failed, return mock data in development or empty in production
  if (!client) {
    if (isDevelopment()) {
      logger.warn('Unable to create Shopify client. Returning mock data for development.');
      return mockShopifyProducts;
    } else {
      logger.error('Unable to create Shopify client in production. Returning empty product list.');
      return [];
    }
  }

  // Implement retry logic for rate limits and transient errors
  let attempt = 0;
  const endpoint = 'products';

  while (attempt < MAX_RETRY_ATTEMPTS) {
    try {
      // Check if we need to delay for rate limiting
      const delayMs = getRateLimitDelay(endpoint);
      if (delayMs > 0) {
        logger.debug(`Rate limit delay: waiting ${delayMs}ms before Shopify API request`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      // Make the API request
      const response = await client.get({
        path: endpoint,
        query: { limit: 50 },
      });

      // Return the products
      return response.body.products;
    } catch (error) {
      attempt++;

      // Handle different types of errors
      if (error instanceof ShopifyErrors.HttpResponseError) {
        // Handle rate limiting errors
        if (error.response.code === 429) {
          const retryAfter = parseInt((error.response.headers['retry-after'] as string) || '1');
          logger.warn(`Shopify API rate limit exceeded. Retrying after ${retryAfter} seconds.`);
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          continue;
        }

        // Handle authentication errors
        if (error.response.code === 401) {
          logger.error('Shopify API authentication failed. Access token may be invalid.');
          break; // Exit retry loop for auth errors
        }
      }

      // For all other errors, retry with increasing delay
      if (attempt < MAX_RETRY_ATTEMPTS) {
        const delay = RATE_LIMIT_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(
          `Shopify API request failed. Retrying in ${delay}ms. Attempt ${attempt}/${MAX_RETRY_ATTEMPTS}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Log the final error
        logger.error(
          'Shopify API request failed after maximum retry attempts:',
          error instanceof Error ? error.message : String(error)
        );

        // Return mock data in development, empty array in production
        return isDevelopment() ? mockShopifyProducts : [];
      }
    }
  }

  // If we've reached here, all attempts failed
  logger.error('Unable to fetch products from Shopify after multiple attempts');
  return isDevelopment() ? mockShopifyProducts : [];
};

/**
 * Check if Shopify integration is available
 * @returns True if Shopify integration is properly configured and available
 */
export const isShopifyAvailable = async (): Promise<boolean> => {
  if (!isShopifyEnabled()) {
    return false;
  }

  const client = await createAdminRestClient();
  return client !== null;
};

/**
 * Initialize the OAuth flow for Shopify integration
 * @param redirectUri The URI to redirect to after authentication
 * @returns The authorization URL to redirect the user to
 */
export const initializeOAuth = async (redirectUri: string): Promise<string | null> => {
  const shopify = getShopifyApi();

  if (!shopify) {
    logger.error('Cannot initialize OAuth: Shopify API not configured correctly');
    return null;
  }

  try {
    const shop = new URL(config.SHOPIFY_STORE_URL!).hostname;

    // Create a fake request object for Shopify API
    const fakeRequest = {
      url: `https://${shop}/admin/oauth/authorize`,
      headers: {
        host: shop,
      },
    };

    // Generate the authorization URL
    // Using any type due to API differences in Shopify API versions
    const authModule = shopify.auth as any;
    let authPath;

    if (typeof authModule.begin === 'function') {
      // Older API versions use begin
      authPath = await authModule.begin({
        shop,
        callbackPath: redirectUri,
        isOnline: false,
        rawRequest: fakeRequest,
      });
    } else if (typeof authModule.beginAuth === 'function') {
      // Newer API versions use beginAuth
      authPath = await authModule.beginAuth({
        shop,
        callbackPath: redirectUri,
        isOnline: false,
        rawRequest: fakeRequest,
      });
    } else {
      logger.error('Neither auth.begin nor auth.beginAuth exists in the Shopify API');
      return null;
    }

    return authPath;
  } catch (error) {
    logger.error(
      'Error initializing Shopify OAuth:',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
};

/**
 * Complete the OAuth flow for Shopify integration
 * @param request The request object from the OAuth callback
 * @returns True if authentication was successful
 */
export const completeOAuth = async (
  shop: string,
  code: string,
  state: string
): Promise<boolean> => {
  const shopify = getShopifyApi();

  if (!shopify) {
    logger.error('Cannot complete OAuth: Shopify API not configured correctly');
    return false;
  }

  try {
    // Create a fake request object with the required properties
    const fakeRequest = {
      url: `https://${shop}/admin/oauth/authorize?code=${code}&shop=${shop}&state=${state}`,
      headers: {
        host: shop,
      },
    };

    // Create a fake response object
    const fakeResponse = {
      statusCode: 200,
      headers: {},
      setHeader: (key: string, value: string) => {
        (fakeResponse.headers as any)[key] = value;
      },
    };

    // Exchange the authorization code for an access token
    // Using any type due to API differences in Shopify API versions
    const authModule = shopify.auth as any;
    let session;

    if (typeof authModule.callback === 'function') {
      // Newer versions use callback
      const callbackParams: any = {
        rawRequest: fakeRequest as any,
        rawResponse: fakeResponse as any,
      };

      const callbackResponse = await authModule.callback(callbackParams);
      session = callbackResponse?.session;
    } else if (typeof authModule.validateAuthCallback === 'function') {
      // Older versions use validateAuthCallback
      session = await authModule.validateAuthCallback(fakeRequest, fakeResponse, {
        shop,
        state,
        code,
      });
    } else {
      logger.error('Neither auth.callback nor auth.validateAuthCallback exists in the Shopify API');
      return false;
    }

    // Store the access token for future use
    if (session && session.accessToken) {
      await storeAccessToken(shop, session.accessToken);
      logger.info(`Successfully authenticated with Shopify for shop: ${shop}`);
      return true;
    }

    logger.error('Shopify OAuth completed but no access token was received');
    return false;
  } catch (error) {
    logger.error(
      'Error completing Shopify OAuth:',
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
};

/**
 * Register webhooks with Shopify
 * @param webhooks Array of webhook configurations to register
 */
export const registerShopifyWebhooks = async (
  webhooks: Array<{ topic: string; address: string; format: string }>
): Promise<Array<{ success: boolean; topic: string; result: any }>> => {
  try {
    const client = await createAdminRestClient();
    if (!client) {
      throw new Error('Failed to create Shopify Admin API client');
    }

    // Register each webhook
    const results = await Promise.all(
      webhooks.map(async (webhook) => {
        try {
          // Check if webhook already exists
          const existingWebhooks = await client.get({
            path: 'webhooks',
            query: {
              address: webhook.address,
              topic: webhook.topic,
            },
          });

          // If webhook exists, return it
          if (existingWebhooks.body.webhooks && existingWebhooks.body.webhooks.length > 0) {
            return {
              success: true,
              topic: webhook.topic,
              result: { message: 'Webhook already exists' },
            };
          }

          // Create new webhook
          const result = await client.post({
            path: 'webhooks',
            data: {
              webhook: {
                topic: webhook.topic,
                address: webhook.address,
                format: webhook.format || 'json',
              },
            },
          });

          return {
            success: true,
            topic: webhook.topic,
            result: result.body.webhook,
          };
        } catch (error) {
          logger.error(`Failed to register webhook for ${webhook.topic}:`, error);
          return {
            success: false,
            topic: webhook.topic,
            result: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    return results;
  } catch (error) {
    logger.error('Error in registerShopifyWebhooks:', error);
    throw error;
  }
};

// Initialize the module
export default {
  fetchProducts: fetchShopifyProducts,
  isAvailable: isShopifyAvailable,
  initializeOAuth,
  completeOAuth,
  storeAccessToken,
  registerShopifyWebhooks,
  createRestClient: createAdminRestClient,
  createGraphQLClient: createAdminGraphQLClient,
  isShopifyAvailable,
};
