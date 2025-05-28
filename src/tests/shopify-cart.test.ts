import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app';
import User from '../models/user.model';
import { generateToken } from '../utils/auth';
import shopifyService from '../services/shopify.service';

// Mock the shopify service
jest.mock('../services/shopify.service');

describe('Shopify Cart Management API', () => {
  let token: string;
  let userId: string;
  const mockCartId = 'gid://shopify/Cart/c1-test-cart-id';
  const mockLineId = 'gid://shopify/CartLine/l1-test-line-id';
  const mockVariantId = 'gid://shopify/ProductVariant/v1-test-variant-id';

  // Setup test user before all tests
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test');
    
    // Create a test user
    const testUser = await User.create({
      name: 'Test User',
      email: 'cart-test@example.com',
      password: 'password123',
    });
    
    userId = testUser._id.toString();
    token = generateToken(userId);

    // Mock shopify service responses
    (shopifyService.createCart as jest.Mock).mockResolvedValue({
      id: mockCartId,
      userId,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    (shopifyService.addToCart as jest.Mock).mockResolvedValue({
      id: mockCartId,
      userId,
      items: [
        {
          id: mockLineId,
          variantId: mockVariantId,
          productTitle: 'Test Coffee',
          variantTitle: '250g',
          price: {
            amount: '15.99',
            currencyCode: 'USD',
          },
          quantity: 1,
          imageUrl: 'https://example.com/test-coffee.jpg',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    (shopifyService.updateCartItem as jest.Mock).mockResolvedValue({
      id: mockCartId,
      userId,
      items: [
        {
          id: mockLineId,
          variantId: mockVariantId,
          productTitle: 'Test Coffee',
          variantTitle: '250g',
          price: {
            amount: '15.99',
            currencyCode: 'USD',
          },
          quantity: 2, // Updated quantity
          imageUrl: 'https://example.com/test-coffee.jpg',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    (shopifyService.removeFromCart as jest.Mock).mockResolvedValue({
      id: mockCartId,
      userId,
      items: [], // Empty after removal
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    (shopifyService.getCart as jest.Mock).mockResolvedValue({
      id: mockCartId,
      userId,
      items: [
        {
          id: mockLineId,
          variantId: mockVariantId,
          productTitle: 'Test Coffee',
          variantTitle: '250g',
          price: {
            amount: '15.99',
            currencyCode: 'USD',
          },
          quantity: 1,
          imageUrl: 'https://example.com/test-coffee.jpg',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      estimatedCost: {
        totalAmount: {
          amount: '19.99',
          currencyCode: 'USD',
        },
        subtotalAmount: {
          amount: '15.99',
          currencyCode: 'USD',
        },
        totalTaxAmount: {
          amount: '4.00',
          currencyCode: 'USD',
        },
      },
    });
  });

  // Clean up after all tests
  afterAll(async () => {
    await User.deleteMany({});
    await mongoose.connection.close();
  });

  // Reset mocks between tests
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/shopify/cart', () => {
    it('should create a new cart', async () => {
      const response = await request(app)
        .post('/api/shopify/cart')
        .set('Authorization', `Bearer ${token}`)
        .send();

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id', mockCartId);
      expect(shopifyService.createCart).toHaveBeenCalledWith(userId);
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .post('/api/shopify/cart')
        .send();

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/shopify/cart/items', () => {
    it('should add an item to the cart', async () => {
      const response = await request(app)
        .post('/api/shopify/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({
          cartId: mockCartId,
          variantId: mockVariantId,
          quantity: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0]).toHaveProperty('id', mockLineId);
      expect(shopifyService.addToCart).toHaveBeenCalledWith(
        mockCartId,
        mockVariantId,
        1
      );
    });

    it('should return 400 if missing required fields', async () => {
      const response = await request(app)
        .post('/api/shopify/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({
          // Missing cartId
          variantId: mockVariantId,
          quantity: 1,
        });

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/shopify/cart/items/:lineId', () => {
    it('should update cart item quantity', async () => {
      const response = await request(app)
        .put(`/api/shopify/cart/items/${mockLineId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          cartId: mockCartId,
          quantity: 2,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.items[0]).toHaveProperty('quantity', 2);
      expect(shopifyService.updateCartItem).toHaveBeenCalledWith(
        mockCartId,
        mockLineId,
        2
      );
    });

    it('should return 400 if missing required fields', async () => {
      const response = await request(app)
        .put(`/api/shopify/cart/items/${mockLineId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          // Missing cartId
          quantity: 2,
        });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/shopify/cart/items/:lineId', () => {
    it('should remove an item from the cart', async () => {
      const response = await request(app)
        .delete(`/api/shopify/cart/items/${mockLineId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          cartId: mockCartId,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toHaveLength(0);
      expect(shopifyService.removeFromCart).toHaveBeenCalledWith(
        mockCartId,
        mockLineId
      );
    });

    it('should return 400 if missing required fields', async () => {
      const response = await request(app)
        .delete(`/api/shopify/cart/items/${mockLineId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          // Missing cartId
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/shopify/cart/:id', () => {
    it('should get cart details', async () => {
      const response = await request(app)
        .get(`/api/shopify/cart/${mockCartId}`)
        .set('Authorization', `Bearer ${token}`)
        .send();

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id', mockCartId);
      expect(response.body.data).toHaveProperty('estimatedCost');
      expect(shopifyService.getCart).toHaveBeenCalledWith(mockCartId);
    });

    it('should return 404 if cart not found', async () => {
      // Mock cart not found
      (shopifyService.getCart as jest.Mock).mockRejectedValueOnce(
        new Error('Cart not found')
      );

      const response = await request(app)
        .get(`/api/shopify/cart/invalid-id`)
        .set('Authorization', `Bearer ${token}`)
        .send();

      expect(response.status).toBe(404);
    });
  });
}); 