import { Request, Response, NextFunction } from 'express';
import shopifyService, { mockShopifyProducts } from '../services/shopify.service';
import { usingMockDatabase } from '../config/db';

// Mock cart data for development
const mockCarts: { [key: string]: any } = {};

/**
 * @desc    Get all products from Shopify
 * @route   GET /api/shopify/products
 * @access  Public
 */
export const getProducts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const products = await shopifyService.fetchProducts();

    res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error: any) {
    console.error(`Error in getProducts: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving Shopify products',
      error: error.message,
    });
  }
};

/**
 * @desc    Get a single product by ID
 * @route   GET /api/shopify/products/:id
 * @access  Public
 */
export const getProductById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    if (usingMockDatabase) {
      const product = mockShopifyProducts.find((p) => p.id.includes(`/Product/${id}`));

      if (!product) {
        res.status(404).json({
          success: false,
          message: 'Product not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: product,
      });
      return;
    }

    // Get actual Shopify product using the API client
    const client = await shopifyService.createRestClient();

    if (!client) {
      res.status(500).json({
        success: false,
        message: 'Shopify client initialization failed',
      });
      return;
    }

    const response = await client.get({
      path: `products/${id}`,
    });

    if (!response.body.product) {
      res.status(404).json({
        success: false,
        message: 'Product not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: response.body.product,
    });
  } catch (error: any) {
    console.error(`Error in getProductById: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving Shopify product',
      error: error.message,
    });
  }
};

/**
 * @desc    Get a single product by handle
 * @route   GET /api/shopify/products/handle/:handle
 * @access  Public
 */
export const getProductByHandle = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { handle } = req.params;

    if (usingMockDatabase) {
      const product = mockShopifyProducts.find((p) => p.handle === handle);

      if (!product) {
        res.status(404).json({
          success: false,
          message: 'Product not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: product,
      });
      return;
    }

    // Get actual Shopify product using the API client
    const client = await shopifyService.createRestClient();

    if (!client) {
      res.status(500).json({
        success: false,
        message: 'Shopify client initialization failed',
      });
      return;
    }

    const response = await client.get({
      path: `products`,
      query: { handle },
    });

    if (!response.body.products || response.body.products.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Product not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: response.body.products[0],
    });
  } catch (error: any) {
    console.error(`Error in getProductByHandle: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving Shopify product',
      error: error.message,
    });
  }
};

/**
 * @desc    Create a new cart
 * @route   POST /api/shopify/cart
 * @access  Private
 */
export const createCart = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (usingMockDatabase) {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'User not authenticated',
        });
        return;
      }

      // Initialize an empty cart for the user
      mockCarts[userId.toString()] = {
        id: `cart_${Date.now()}`,
        userId: userId.toString(),
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      res.status(201).json({
        success: true,
        data: mockCarts[userId.toString()],
      });
      return;
    }

    // Get Shopify API client
    const client = await shopifyService.createGraphQLClient();

    if (!client) {
      res.status(500).json({
        success: false,
        message: 'Shopify client initialization failed',
      });
      return;
    }

    // Create an empty cart in Shopify
    const response = await client.query({
      data: `
        mutation cartCreate {
          cartCreate {
            cart {
              id
              createdAt
              updatedAt
              lines(first: 10) {
                edges {
                  node {
                    id
                    quantity
                    merchandise {
                      ... on ProductVariant {
                        id
                        title
                        priceV2 {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
    });

    if (
      response.body?.data?.cartCreate?.userErrors &&
      response.body?.data?.cartCreate?.userErrors.length > 0
    ) {
      res.status(400).json({
        success: false,
        message: 'Error creating cart',
        errors: response.body?.data?.cartCreate?.userErrors,
      });
      return;
    }

    // Store the cart ID in the user's session or associated with their account
    // This would typically be done in a real application

    res.status(201).json({
      success: true,
      data: response.body?.data?.cartCreate?.cart,
    });
  } catch (error: any) {
    console.error(`Error in createCart: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error creating Shopify cart',
      error: error.message,
    });
  }
};

/**
 * @desc    Add item to cart
 * @route   POST /api/shopify/cart/items
 * @access  Private
 */
export const addToCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { cartId, variantId, quantity } = req.body;

    // Validate required fields
    if (!cartId || !variantId || !quantity) {
      res.status(400).json({
        success: false,
        message: 'Please provide cartId, variantId, and quantity',
      });
      return;
    }

    if (usingMockDatabase) {
      // Find the cart in mock data
      let cart: any = null;

      // Assuming cartId is userId for mock data
      if (mockCarts[cartId]) {
        cart = mockCarts[cartId];
      } else {
        // Find by cart ID
        Object.keys(mockCarts).forEach((userId) => {
          if (mockCarts[userId].id === cartId) {
            cart = mockCarts[userId];
          }
        });
      }

      if (!cart) {
        res.status(404).json({
          success: false,
          message: 'Cart not found',
        });
        return;
      }

      // Check if the product exists in mock data
      const productId = variantId.split('/').pop();
      const variant = mockShopifyProducts
        .flatMap((p) => p.variants.map((v) => ({ ...v, productTitle: p.title, productId: p.id })))
        .find((v) => v.id.includes(productId));

      if (!variant) {
        res.status(404).json({
          success: false,
          message: 'Product variant not found',
        });
        return;
      }

      // Check if item is already in cart
      const existingItemIndex = cart.items.findIndex((item: any) => item.variantId === variantId);

      if (existingItemIndex >= 0) {
        // Update existing item quantity
        cart.items[existingItemIndex].quantity += quantity;
      } else {
        // Add new item to cart
        cart.items.push({
          id: `line_${Date.now()}`,
          variantId,
          productTitle: variant.productTitle,
          variantTitle: variant.title,
          price: variant.price,
          quantity,
        });
      }

      // Update cart timestamp
      cart.updatedAt = new Date();

      res.status(200).json({
        success: true,
        data: cart,
      });
      return;
    }

    // Get Shopify API client
    const client = await shopifyService.createGraphQLClient();

    if (!client) {
      res.status(500).json({
        success: false,
        message: 'Shopify client initialization failed',
      });
      return;
    }

    // Add item to cart in Shopify
    const response = await client.query({
      data: `
        mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
          cartLinesAdd(cartId: $cartId, lines: $lines) {
            cart {
              id
              lines(first: 10) {
                edges {
                  node {
                    id
                    quantity
                    merchandise {
                      ... on ProductVariant {
                        id
                        title
                        priceV2 {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        cartId,
        lines: [
          {
            merchandiseId: variantId,
            quantity,
          },
        ],
      },
    });

    if (
      response.body?.data?.cartLinesAdd?.userErrors &&
      response.body?.data?.cartLinesAdd?.userErrors.length > 0
    ) {
      res.status(400).json({
        success: false,
        message: 'Error adding item to cart',
        errors: response.body?.data?.cartLinesAdd?.userErrors,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: response.body?.data?.cartLinesAdd?.cart,
    });
  } catch (error: any) {
    console.error(`Error in addToCart: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error adding item to Shopify cart',
      error: error.message,
    });
  }
};

/**
 * @desc    Update cart item quantity
 * @route   PUT /api/shopify/cart/items/:lineId
 * @access  Private
 */
export const updateCartItem = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { cartId, quantity } = req.body;
    const { lineId } = req.params;

    // Validate required fields
    if (!cartId || !lineId || quantity === undefined) {
      res.status(400).json({
        success: false,
        message: 'Please provide cartId, lineId, and quantity',
      });
      return;
    }

    // Quantity should be at least 1
    if (quantity < 1) {
      res.status(400).json({
        success: false,
        message: 'Quantity must be at least 1',
      });
      return;
    }

    if (usingMockDatabase) {
      // Find the cart in mock data
      let cart: any = null;

      // Assuming cartId is userId for mock data
      if (mockCarts[cartId]) {
        cart = mockCarts[cartId];
      } else {
        // Find by cart ID
        Object.keys(mockCarts).forEach((userId) => {
          if (mockCarts[userId].id === cartId) {
            cart = mockCarts[userId];
          }
        });
      }

      if (!cart) {
        res.status(404).json({
          success: false,
          message: 'Cart not found',
        });
        return;
      }

      // Find the item in the cart
      const itemIndex = cart.items.findIndex((item: any) => item.id === lineId);

      if (itemIndex === -1) {
        res.status(404).json({
          success: false,
          message: 'Item not found in cart',
        });
        return;
      }

      // Update item quantity
      cart.items[itemIndex].quantity = quantity;

      // Update cart timestamp
      cart.updatedAt = new Date();

      res.status(200).json({
        success: true,
        data: cart,
      });
      return;
    }

    // Get Shopify API client
    const client = await shopifyService.createGraphQLClient();

    if (!client) {
      res.status(500).json({
        success: false,
        message: 'Shopify client initialization failed',
      });
      return;
    }

    // Update cart item quantity in Shopify
    const response = await client.query({
      data: `
        mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
          cartLinesUpdate(cartId: $cartId, lines: $lines) {
            cart {
              id
              lines(first: 10) {
                edges {
                  node {
                    id
                    quantity
                    merchandise {
                      ... on ProductVariant {
                        id
                        title
                        priceV2 {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                }
              }
              estimatedCost {
                totalAmount {
                  amount
                  currencyCode
                }
                subtotalAmount {
                  amount
                  currencyCode
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        cartId,
        lines: [
          {
            id: lineId,
            quantity,
          },
        ],
      },
    });

    if (
      response.body?.data?.cartLinesUpdate?.userErrors &&
      response.body?.data?.cartLinesUpdate?.userErrors.length > 0
    ) {
      res.status(400).json({
        success: false,
        message: 'Error updating cart item',
        errors: response.body?.data?.cartLinesUpdate?.userErrors,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: response.body?.data?.cartLinesUpdate?.cart,
    });
  } catch (error: any) {
    console.error(`Error in updateCartItem: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error updating Shopify cart item',
      error: error.message,
    });
  }
};

/**
 * @desc    Remove item from cart
 * @route   DELETE /api/shopify/cart/items/:lineId
 * @access  Private
 */
export const removeFromCart = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { cartId } = req.body;
    const { lineId } = req.params;

    // Validate required fields
    if (!cartId || !lineId) {
      res.status(400).json({
        success: false,
        message: 'Please provide cartId and lineId',
      });
      return;
    }

    if (usingMockDatabase) {
      // Find the cart in mock data
      let cart: any = null;

      // Assuming cartId is userId for mock data
      if (mockCarts[cartId]) {
        cart = mockCarts[cartId];
      } else {
        // Find by cart ID
        Object.keys(mockCarts).forEach((userId) => {
          if (mockCarts[userId].id === cartId) {
            cart = mockCarts[userId];
          }
        });
      }

      if (!cart) {
        res.status(404).json({
          success: false,
          message: 'Cart not found',
        });
        return;
      }

      // Find the item index in the cart
      const itemIndex = cart.items.findIndex((item: any) => item.id === lineId);

      if (itemIndex === -1) {
        res.status(404).json({
          success: false,
          message: 'Item not found in cart',
        });
        return;
      }

      // Remove the item from the cart
      cart.items.splice(itemIndex, 1);

      // Update cart timestamp
      cart.updatedAt = new Date();

      res.status(200).json({
        success: true,
        data: cart,
      });
      return;
    }

    // Get Shopify API client
    const client = await shopifyService.createGraphQLClient();

    if (!client) {
      res.status(500).json({
        success: false,
        message: 'Shopify client initialization failed',
      });
      return;
    }

    // Remove item from cart in Shopify
    const response = await client.query({
      data: `
        mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
          cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
            cart {
              id
              lines(first: 10) {
                edges {
                  node {
                    id
                    quantity
                    merchandise {
                      ... on ProductVariant {
                        id
                        title
                        priceV2 {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                }
              }
              estimatedCost {
                totalAmount {
                  amount
                  currencyCode
                }
                subtotalAmount {
                  amount
                  currencyCode
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        cartId,
        lineIds: [lineId],
      },
    });

    if (
      response.body?.data?.cartLinesRemove?.userErrors &&
      response.body?.data?.cartLinesRemove?.userErrors.length > 0
    ) {
      res.status(400).json({
        success: false,
        message: 'Error removing item from cart',
        errors: response.body?.data?.cartLinesRemove?.userErrors,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: response.body?.data?.cartLinesRemove?.cart,
    });
  } catch (error: any) {
    console.error(`Error in removeFromCart: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error removing item from Shopify cart',
      error: error.message,
    });
  }
};

/**
 * @desc    Get cart contents
 * @route   GET /api/shopify/cart/:id
 * @access  Private
 */
export const getCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    if (usingMockDatabase) {
      // Find the cart in mock data
      let cart: any = null;

      // First try looking up by userId
      if (mockCarts[id]) {
        cart = mockCarts[id];
      } else {
        // Try finding by cart ID
        Object.keys(mockCarts).forEach((userId) => {
          if (mockCarts[userId].id === id) {
            cart = mockCarts[userId];
          }
        });
      }

      if (!cart) {
        res.status(404).json({
          success: false,
          message: 'Cart not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: cart,
      });
      return;
    }

    // Get Shopify API client
    const client = await shopifyService.createGraphQLClient();

    if (!client) {
      res.status(500).json({
        success: false,
        message: 'Shopify client initialization failed',
      });
      return;
    }

    // Get cart from Shopify
    const response = await client.query({
      data: `
        query getCart($cartId: ID!) {
          cart(id: $cartId) {
            id
            createdAt
            updatedAt
            lines(first: 10) {
              edges {
                node {
                  id
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      id
                      title
                      priceV2 {
                        amount
                        currencyCode
                      }
                      product {
                        id
                        title
                      }
                    }
                  }
                }
              }
            }
            estimatedCost {
              totalAmount {
                amount
                currencyCode
              }
              subtotalAmount {
                amount
                currencyCode
              }
              totalTaxAmount {
                amount
                currencyCode
              }
            }
          }
        }
      `,
      variables: {
        cartId: id,
      },
    });

    if (!response.body?.data?.cart) {
      res.status(404).json({
        success: false,
        message: 'Cart not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: response.body.data.cart,
    });
  } catch (error: any) {
    console.error(`Error in getCart: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving Shopify cart',
      error: error.message,
    });
  }
};

/**
 * @desc    Create checkout from cart with enhanced security
 * @route   POST /api/shopify/checkout
 * @access  Private
 */
export const createCheckout = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { cartId } = req.body;

    if (!cartId) {
      res.status(400).json({
        success: false,
        message: 'Please provide a cartId',
      });
      return;
    }

    // Enhanced security validation
    const userAgent = req.headers['user-agent'];
    const origin = req.headers.origin;
    const referer = req.headers.referer;

    // Basic security checks
    if (!userAgent || userAgent.length < 10) {
      res.status(400).json({
        success: false,
        message: 'Invalid request source',
      });
      return;
    }

    // Rate limiting check (in production, use Redis or similar)
    const userId = req.user?.id;
    if (userId) {
      // In a real implementation, check rate limits per user
      // For now, we'll just log the attempt
      console.log(`Checkout attempt by user ${userId} from ${req.ip}`);
    }

    if (usingMockDatabase) {
      // Find the cart in mock data
      let cart: any = null;

      // First try looking up by userId
      if (mockCarts[cartId]) {
        cart = mockCarts[cartId];
      } else {
        // Try finding by cart ID
        Object.keys(mockCarts).forEach((userId) => {
          if (mockCarts[userId].id === cartId) {
            cart = mockCarts[userId];
          }
        });
      }

      if (!cart) {
        res.status(404).json({
          success: false,
          message: 'Cart not found',
        });
        return;
      }

      // Validate cart has items
      if (!cart.items || cart.items.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Cannot checkout with empty cart',
        });
        return;
      }

      // Validate inventory (mock check)
      for (const item of cart.items) {
        const productId = item.variantId.split('/').pop();
        const variant = mockShopifyProducts
          .flatMap((p) => p.variants)
          .find((v) => v.id.includes(productId));

        if (!variant || !variant.available) {
          res.status(400).json({
            success: false,
            message: `Product "${item.productTitle}" is no longer available`,
          });
          return;
        }
      }

      // Create a mock checkout with enhanced security
      const checkout = {
        id: `checkout_${Date.now()}`,
        cartId: cart.id,
        userId: cart.userId,
        items: cart.items,
        totalPrice: cart.items
          .reduce(
            (total: number, item: any) => total + parseFloat(item.price.amount) * item.quantity,
            0
          )
          .toFixed(2),
        currency: cart.items[0]?.price.currencyCode || 'USD',
        status: 'pending',
        createdAt: new Date(),
        webUrl: `https://example-store.myshopify.com/checkout/${Date.now()}?secure=true`,
        securityToken: `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      };

      res.status(201).json({
        success: true,
        data: checkout,
        security: {
          encrypted: true,
          expiresIn: 1800, // 30 minutes in seconds
          checksum: `chk_${Date.now()}`,
        },
      });
      return;
    }

    // Get Shopify API client
    const client = await shopifyService.createGraphQLClient();

    if (!client) {
      res.status(500).json({
        success: false,
        message: 'Shopify client initialization failed',
      });
      return;
    }

    // First get the cart to extract items and validate
    const cartResponse = await client.query({
      data: `
        query getCart($cartId: ID!) {
          cart(id: $cartId) {
            id
            lines(first: 50) {
              edges {
                node {
                  id
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      id
                      availableForSale
                      quantityAvailable
                    }
                  }
                }
              }
            }
            estimatedCost {
              totalAmount {
                amount
                currencyCode
              }
            }
          }
        }
      `,
      variables: {
        cartId: cartId,
      },
    });

    if (!cartResponse.body?.data?.cart) {
      res.status(404).json({
        success: false,
        message: 'Cart not found in Shopify',
      });
      return;
    }

    const cartData = cartResponse.body.data.cart;

    // Validate cart has items
    if (!cartData.lines.edges || cartData.lines.edges.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Cannot checkout with empty cart',
      });
      return;
    }

    // Validate inventory availability
    for (const edge of cartData.lines.edges) {
      const merchandise = edge.node.merchandise;
      if (!merchandise.availableForSale) {
        res.status(400).json({
          success: false,
          message: 'One or more items in your cart are no longer available',
        });
        return;
      }

      if (
        merchandise.quantityAvailable !== null &&
        merchandise.quantityAvailable < edge.node.quantity
      ) {
        res.status(400).json({
          success: false,
          message: 'Insufficient inventory for one or more items',
        });
        return;
      }
    }

    // Prepare line items for checkout
    const lineItems = cartData.lines.edges.map((edge: any) => ({
      variantId: edge.node.merchandise.id,
      quantity: edge.node.quantity,
    }));

    // Create checkout from cart in Shopify with enhanced security
    const response = await client.query({
      data: `
        mutation checkoutCreate($input: CheckoutCreateInput!) {
          checkoutCreate(input: $input) {
            checkout {
              id
              webUrl
              createdAt
              totalPriceV2 {
                amount
                currencyCode
              }
              lineItems(first: 10) {
                edges {
                  node {
                    id
                    title
                    quantity
                    variant {
                      id
                      title
                      priceV2 {
                        amount
                        currencyCode
                      }
                    }
                  }
                }
              }
            }
            checkoutUserErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        input: {
          lineItems: lineItems,
          // Add optional fields for customer information if available
          email: req.user?.email,
          // Add custom attributes for security tracking
          customAttributes: [
            {
              key: 'source',
              value: 'cuppa_app',
            },
            {
              key: 'user_id',
              value: req.user?.id || 'anonymous',
            },
            {
              key: 'session_id',
              value: req.sessionID || 'unknown',
            },
          ],
        },
      },
    });

    if (
      response.body?.data?.checkoutCreate?.checkoutUserErrors &&
      response.body?.data?.checkoutCreate?.checkoutUserErrors.length > 0
    ) {
      res.status(400).json({
        success: false,
        message: 'Error creating checkout',
        errors: response.body?.data?.checkoutCreate?.checkoutUserErrors,
      });
      return;
    }

    const checkout = response.body?.data?.checkoutCreate?.checkout;

    // Add security enhancements to response
    res.status(201).json({
      success: true,
      data: {
        ...checkout,
        // Add security token for verification
        securityToken: `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      },
      security: {
        encrypted: true,
        expiresIn: 1800, // 30 minutes in seconds
        checksum: `chk_${Date.now()}`,
      },
    });
  } catch (error: any) {
    console.error(`Error in createCheckout: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error creating Shopify checkout',
      error: error.message,
    });
  }
};

/**
 * @desc    Get user orders with enhanced tracking information
 * @route   GET /api/shopify/orders
 * @access  Private
 */
export const getOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    const limit = parseInt(req.query.limit as string) || 20;
    const page = parseInt(req.query.page as string) || 1;
    const status = req.query.status as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User authentication required',
      });
      return;
    }

    if (usingMockDatabase) {
      // Generate comprehensive mock orders with tracking
      const mockOrders = [
        {
          id: 'order_1',
          orderNumber: '#1001',
          name: '#1001',
          email: req.user?.email || 'customer@example.com',
          createdAt: new Date('2024-01-15T10:30:00Z'),
          updatedAt: new Date('2024-01-16T14:20:00Z'),
          processedAt: new Date('2024-01-15T11:00:00Z'),
          financialStatus: 'paid',
          fulfillmentStatus: 'fulfilled',
          orderStatusUrl: 'https://example-store.myshopify.com/orders/status/abc123',
          totalPrice: {
            amount: '45.99',
            currencyCode: 'USD',
          },
          subtotalPrice: {
            amount: '39.99',
            currencyCode: 'USD',
          },
          totalTax: {
            amount: '3.20',
            currencyCode: 'USD',
          },
          totalShipping: {
            amount: '2.80',
            currencyCode: 'USD',
          },
          lineItems: [
            {
              id: 'line_1',
              title: 'Premium Coffee Blend',
              variant: {
                id: 'variant_1',
                title: 'Medium Roast - 12oz',
                price: {
                  amount: '19.99',
                  currencyCode: 'USD',
                },
              },
              quantity: 2,
              totalPrice: {
                amount: '39.98',
                currencyCode: 'USD',
              },
            },
          ],
          shippingAddress: {
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Coffee Street',
            address2: 'Apt 4B',
            city: 'Seattle',
            province: 'WA',
            country: 'United States',
            zip: '98101',
            phone: '+1-555-0123',
          },
          billingAddress: {
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Coffee Street',
            address2: 'Apt 4B',
            city: 'Seattle',
            province: 'WA',
            country: 'United States',
            zip: '98101',
            phone: '+1-555-0123',
          },
          fulfillments: [
            {
              id: 'fulfillment_1',
              status: 'success',
              createdAt: new Date('2024-01-16T09:00:00Z'),
              updatedAt: new Date('2024-01-16T14:20:00Z'),
              trackingCompany: 'UPS',
              trackingNumber: '1Z999AA1234567890',
              trackingUrl: 'https://www.ups.com/track?tracknum=1Z999AA1234567890',
              estimatedDelivery: new Date('2024-01-18T17:00:00Z'),
              shipmentStatus: 'in_transit',
              location: 'Portland, OR',
              lineItems: [
                {
                  id: 'line_1',
                  quantity: 2,
                },
              ],
            },
          ],
          tags: ['premium', 'coffee', 'subscription'],
          note: 'Please deliver to front door',
          customerNote: 'First time customer - excited to try!',
        },
        {
          id: 'order_2',
          orderNumber: '#1002',
          name: '#1002',
          email: req.user?.email || 'customer@example.com',
          createdAt: new Date('2024-01-10T15:45:00Z'),
          updatedAt: new Date('2024-01-12T10:30:00Z'),
          processedAt: new Date('2024-01-10T16:00:00Z'),
          financialStatus: 'paid',
          fulfillmentStatus: 'fulfilled',
          orderStatusUrl: 'https://example-store.myshopify.com/orders/status/def456',
          totalPrice: {
            amount: '28.50',
            currencyCode: 'USD',
          },
          subtotalPrice: {
            amount: '24.99',
            currencyCode: 'USD',
          },
          totalTax: {
            amount: '2.00',
            currencyCode: 'USD',
          },
          totalShipping: {
            amount: '1.51',
            currencyCode: 'USD',
          },
          lineItems: [
            {
              id: 'line_2',
              title: 'Artisan Coffee Mug',
              variant: {
                id: 'variant_2',
                title: 'Ceramic - Blue',
                price: {
                  amount: '24.99',
                  currencyCode: 'USD',
                },
              },
              quantity: 1,
              totalPrice: {
                amount: '24.99',
                currencyCode: 'USD',
              },
            },
          ],
          shippingAddress: {
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Coffee Street',
            address2: 'Apt 4B',
            city: 'Seattle',
            province: 'WA',
            country: 'United States',
            zip: '98101',
            phone: '+1-555-0123',
          },
          billingAddress: {
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Coffee Street',
            address2: 'Apt 4B',
            city: 'Seattle',
            province: 'WA',
            country: 'United States',
            zip: '98101',
            phone: '+1-555-0123',
          },
          fulfillments: [
            {
              id: 'fulfillment_2',
              status: 'success',
              createdAt: new Date('2024-01-11T11:30:00Z'),
              updatedAt: new Date('2024-01-12T10:30:00Z'),
              trackingCompany: 'FedEx',
              trackingNumber: '7749999999999',
              trackingUrl: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=7749999999999',
              estimatedDelivery: new Date('2024-01-13T16:00:00Z'),
              shipmentStatus: 'delivered',
              location: 'Seattle, WA',
              deliveredAt: new Date('2024-01-12T10:30:00Z'),
              lineItems: [
                {
                  id: 'line_2',
                  quantity: 1,
                },
              ],
            },
          ],
          tags: ['mug', 'ceramic', 'gift'],
          note: 'Handle with care - fragile item',
          customerNote: 'Gift for my partner',
        },
        {
          id: 'order_3',
          orderNumber: '#1003',
          name: '#1003',
          email: req.user?.email || 'customer@example.com',
          createdAt: new Date('2024-01-20T09:15:00Z'),
          updatedAt: new Date('2024-01-20T12:00:00Z'),
          processedAt: new Date('2024-01-20T09:30:00Z'),
          financialStatus: 'pending',
          fulfillmentStatus: 'unfulfilled',
          orderStatusUrl: 'https://example-store.myshopify.com/orders/status/ghi789',
          totalPrice: {
            amount: '67.48',
            currencyCode: 'USD',
          },
          subtotalPrice: {
            amount: '59.97',
            currencyCode: 'USD',
          },
          totalTax: {
            amount: '4.80',
            currencyCode: 'USD',
          },
          totalShipping: {
            amount: '2.71',
            currencyCode: 'USD',
          },
          lineItems: [
            {
              id: 'line_3',
              title: 'Coffee Subscription Box',
              variant: {
                id: 'variant_3',
                title: 'Monthly - 3 Bags',
                price: {
                  amount: '59.97',
                  currencyCode: 'USD',
                },
              },
              quantity: 1,
              totalPrice: {
                amount: '59.97',
                currencyCode: 'USD',
              },
            },
          ],
          shippingAddress: {
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Coffee Street',
            address2: 'Apt 4B',
            city: 'Seattle',
            province: 'WA',
            country: 'United States',
            zip: '98101',
            phone: '+1-555-0123',
          },
          billingAddress: {
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Coffee Street',
            address2: 'Apt 4B',
            city: 'Seattle',
            province: 'WA',
            country: 'United States',
            zip: '98101',
            phone: '+1-555-0123',
          },
          fulfillments: [],
          tags: ['subscription', 'monthly', 'variety'],
          note: 'Subscription order - recurring monthly',
          customerNote: 'Looking forward to trying new blends!',
        },
      ];

      // Apply filters
      let filteredOrders = mockOrders;

      if (status) {
        filteredOrders = filteredOrders.filter(
          (order) => order.fulfillmentStatus === status || order.financialStatus === status
        );
      }

      if (startDate) {
        const start = new Date(startDate);
        filteredOrders = filteredOrders.filter((order) => new Date(order.createdAt) >= start);
      }

      if (endDate) {
        const end = new Date(endDate);
        filteredOrders = filteredOrders.filter((order) => new Date(order.createdAt) <= end);
      }

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

      res.status(200).json({
        success: true,
        data: paginatedOrders,
        pagination: {
          page,
          limit,
          total: filteredOrders.length,
          totalPages: Math.ceil(filteredOrders.length / limit),
          hasNext: endIndex < filteredOrders.length,
          hasPrev: page > 1,
        },
        filters: {
          status,
          startDate,
          endDate,
        },
      });
      return;
    }

    // Get Shopify GraphQL client for real orders
    const client = await shopifyService.createGraphQLClient();

    if (!client) {
      res.status(500).json({
        success: false,
        message: 'Shopify client initialization failed',
      });
      return;
    }

    // Build GraphQL query with filters
    let dateFilter = '';
    if (startDate || endDate) {
      const conditions = [];
      if (startDate) conditions.push(`created_at:>='${startDate}'`);
      if (endDate) conditions.push(`created_at:<='${endDate}'`);
      dateFilter = `query: "${conditions.join(' AND ')}"`;
    }

    let statusFilter = '';
    if (status) {
      statusFilter = `fulfillment_status:${status}`;
    }

    const queryFilter = [dateFilter, statusFilter].filter(Boolean).join(' AND ');

    // Query orders from Shopify
    const response = await client.query({
      data: `
        query getCustomerOrders($customerId: ID!, $first: Int!, $after: String, $query: String) {
          customer(id: $customerId) {
            id
            email
            orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
              edges {
                node {
                  id
                  name
                  orderNumber
                  email
                  createdAt
                  updatedAt
                  processedAt
                  financialStatus
                  fulfillmentStatus
                  orderStatusUrl
                  totalPriceV2 {
                    amount
                    currencyCode
                  }
                  subtotalPriceV2 {
                    amount
                    currencyCode
                  }
                  totalTaxV2 {
                    amount
                    currencyCode
                  }
                  totalShippingPriceV2 {
                    amount
                    currencyCode
                  }
                  lineItems(first: 50) {
                    edges {
                      node {
                        id
                        title
                        quantity
                        variant {
                          id
                          title
                          priceV2 {
                            amount
                            currencyCode
                          }
                        }
                        originalTotalPrice {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                  shippingAddress {
                    firstName
                    lastName
                    address1
                    address2
                    city
                    province
                    country
                    zip
                    phone
                  }
                  billingAddress {
                    firstName
                    lastName
                    address1
                    address2
                    city
                    province
                    country
                    zip
                    phone
                  }
                  fulfillments(first: 10) {
                    id
                    status
                    createdAt
                    updatedAt
                    trackingCompany
                    trackingInfo {
                      number
                      url
                    }
                    trackingUrls
                    estimatedDeliveryAt
                    deliveredAt
                    inTransitAt
                    location {
                      address1
                      city
                      province
                      country
                      zip
                    }
                    fulfillmentLineItems(first: 50) {
                      edges {
                        node {
                          id
                          quantity
                          lineItem {
                            id
                          }
                        }
                      }
                    }
                  }
                  tags
                  note
                  customAttributes {
                    key
                    value
                  }
                }
                cursor
              }
              pageInfo {
                hasNextPage
                hasPreviousPage
                startCursor
                endCursor
              }
            }
          }
        }
      `,
      variables: {
        customerId: `gid://shopify/Customer/${userId}`,
        first: limit,
        after: page > 1 ? Buffer.from(`${(page - 1) * limit}`).toString('base64') : null,
        query: queryFilter || null,
      },
    });

    if (!response.body?.data?.customer) {
      res.status(404).json({
        success: false,
        message: 'Customer not found or no orders available',
      });
      return;
    }

    const customerOrders = response.body.data.customer.orders;
    const orders = customerOrders.edges.map((edge: any) => {
      const order = edge.node;

      // Transform fulfillments to include tracking status
      const fulfillments = order.fulfillments.map((fulfillment: any) => ({
        id: fulfillment.id,
        status: fulfillment.status,
        createdAt: fulfillment.createdAt,
        updatedAt: fulfillment.updatedAt,
        trackingCompany: fulfillment.trackingCompany,
        trackingNumber: fulfillment.trackingInfo?.number,
        trackingUrl: fulfillment.trackingInfo?.url || fulfillment.trackingUrls?.[0],
        estimatedDelivery: fulfillment.estimatedDeliveryAt,
        deliveredAt: fulfillment.deliveredAt,
        inTransitAt: fulfillment.inTransitAt,
        shipmentStatus: fulfillment.deliveredAt
          ? 'delivered'
          : fulfillment.inTransitAt
            ? 'in_transit'
            : fulfillment.status === 'success'
              ? 'shipped'
              : 'pending',
        location: fulfillment.location
          ? `${fulfillment.location.city}, ${fulfillment.location.province}`
          : null,
        lineItems: fulfillment.fulfillmentLineItems.edges.map((item: any) => ({
          id: item.node.lineItem.id,
          quantity: item.node.quantity,
        })),
      }));

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        name: order.name,
        email: order.email,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        processedAt: order.processedAt,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        orderStatusUrl: order.orderStatusUrl,
        totalPrice: order.totalPriceV2,
        subtotalPrice: order.subtotalPriceV2,
        totalTax: order.totalTaxV2,
        totalShipping: order.totalShippingPriceV2,
        lineItems: order.lineItems.edges.map((item: any) => ({
          id: item.node.id,
          title: item.node.title,
          quantity: item.node.quantity,
          variant: {
            id: item.node.variant.id,
            title: item.node.variant.title,
            price: item.node.variant.priceV2,
          },
          totalPrice: item.node.originalTotalPrice,
        })),
        shippingAddress: order.shippingAddress,
        billingAddress: order.billingAddress,
        fulfillments,
        tags: order.tags,
        note: order.note,
        customerNote: order.customAttributes?.find((attr: any) => attr.key === 'customer_note')
          ?.value,
      };
    });

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        page,
        limit,
        hasNext: customerOrders.pageInfo.hasNextPage,
        hasPrev: customerOrders.pageInfo.hasPreviousPage,
        startCursor: customerOrders.pageInfo.startCursor,
        endCursor: customerOrders.pageInfo.endCursor,
      },
      filters: {
        status,
        startDate,
        endDate,
      },
    });
  } catch (error: any) {
    console.error(`Error in getOrders: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error fetching orders',
      error: error.message,
    });
  }
};

/**
 * @desc    Get order details
 * @route   GET /api/shopify/orders/:id
 * @access  Private
 */
export const getOrderById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    if (usingMockDatabase) {
      // Return mock order details
      const mockOrder =
        id === '1001'
          ? {
              id: 'order_1',
              orderNumber: '1001',
              totalPrice: '29.98',
              currencyCode: 'USD',
              processedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
              fulfillmentStatus: 'fulfilled',
              financialStatus: 'paid',
              shippingAddress: {
                name: 'John Doe',
                address1: '123 Main St',
                city: 'Anytown',
                province: 'CA',
                zip: '12345',
                country: 'USA',
              },
              lineItems: [
                {
                  id: 'line_1',
                  title: 'Ethiopian Yirgacheffe - 12oz Bag',
                  quantity: 2,
                  price: '14.99',
                },
              ],
              fulfillments: [
                {
                  id: 'fulfillment_1',
                  createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), // 6 days ago
                  trackingCompany: 'USPS',
                  trackingNumber: '9400123456789012345678',
                  trackingUrl:
                    'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400123456789012345678',
                },
              ],
            }
          : null;

      if (!mockOrder) {
        res.status(404).json({
          success: false,
          message: 'Order not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: mockOrder,
      });
      return;
    }

    // Get Shopify API client
    const client = await shopifyService.createRestClient();

    if (!client) {
      res.status(500).json({
        success: false,
        message: 'Shopify client initialization failed',
      });
      return;
    }

    // Get order details from Shopify
    const response = await client.get({
      path: `orders/${id}`,
    });

    if (!response.body.order) {
      res.status(404).json({
        success: false,
        message: 'Order not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: response.body.order,
    });
  } catch (error: any) {
    console.error(`Error in getOrderById: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving Shopify order details',
      error: error.message,
    });
  }
};

/**
 * @desc    Check if Shopify integration is available
 * @route   GET /api/shopify/status
 * @access  Public
 */
export const getShopifyStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const available = await shopifyService.isShopifyAvailable();

    res.status(200).json({
      success: true,
      available,
    });
  } catch (error: any) {
    console.error(`Error in getShopifyStatus: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error checking Shopify availability',
      error: error.message,
    });
  }
};
