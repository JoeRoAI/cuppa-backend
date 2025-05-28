/**
 * Shopify Authentication Tests
 * This file contains tests for the Shopify authentication controllers and API endpoints.
 */

import request from 'supertest';
import app from '../index';
import { mockUsers } from '../controllers/auth.controller';
import JwtService from '../utils/jwt.service';
import config from '../config/config';

// Mock our Shopify service to avoid actual API calls during tests
jest.mock('../services/shopify.service', () => ({
  initializeOAuth: jest.fn().mockResolvedValue('https://example.myshopify.com/admin/oauth/authorize'),
  completeOAuth: jest.fn().mockResolvedValue(true),
  storeAccessToken: jest.fn().mockResolvedValue(undefined),
}));

describe('Shopify Authentication API', () => {
  let adminToken: string;
  let customerToken: string;

  beforeAll(() => {
    // Create JWT tokens for testing
    const adminUser = mockUsers.find((user) => user.role === 'admin');
    const customerUser = mockUsers.find((user) => user.role === 'user');

    if (adminUser && customerUser) {
      adminToken = JwtService.generateAccessToken(adminUser);
      customerToken = JwtService.generateAccessToken(customerUser);
    }

    // Mock environment variables
    const originalEnv = process.env;
    jest.resetModules();
    process.env = {
      ...originalEnv,
      SHOPIFY_API_KEY: 'test_api_key',
      SHOPIFY_API_SECRET: 'test_api_secret',
      SHOPIFY_STORE_URL: 'https://test-shop.myshopify.com',
      NODE_ENV: 'test',
    };
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  // Test connection status endpoint
  describe('GET /api/shopify/auth/status', () => {
    test('Should return connection status for admin users', async () => {
      const res = await request(app)
        .get('/api/shopify/auth/status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('isConfigured');
      expect(res.body.data).toHaveProperty('storeUrl');
    });

    test('Should reject non-admin users', async () => {
      const res = await request(app)
        .get('/api/shopify/auth/status')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    test('Should reject unauthenticated requests', async () => {
      const res = await request(app).get('/api/shopify/auth/status');

      expect(res.status).toBe(401);
    });
  });

  // Test OAuth initialization endpoint
  describe('GET /api/shopify/auth/oauth', () => {
    test('Should start OAuth flow for admin users', async () => {
      const res = await request(app)
        .get('/api/shopify/auth/oauth')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('authUrl');
    });

    test('Should reject non-admin users', async () => {
      const res = await request(app)
        .get('/api/shopify/auth/oauth')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });
  });

  // Test OAuth callback endpoint
  describe('GET /api/shopify/auth/callback', () => {
    test('Should handle successful OAuth callback', async () => {
      const res = await request(app)
        .get('/api/shopify/auth/callback')
        .query({
          shop: 'test-shop.myshopify.com',
          code: 'test_auth_code',
          state: 'test_state',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Should reject callback without required params', async () => {
      const res = await request(app).get('/api/shopify/auth/callback');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // Test Multipass token generation
  describe('POST /api/shopify/auth/multipass', () => {
    test('Should generate Multipass token for authenticated users', async () => {
      // Store the original environment variables
      const originalSecretKey = config.SHOPIFY_API_SECRET;
      const originalStoreUrl = config.SHOPIFY_STORE_URL;

      // Temporarily set the environment variables for this test
      Object.defineProperty(config, 'SHOPIFY_API_SECRET', {
        value: 'test_api_secret',
        writable: true,
      });

      Object.defineProperty(config, 'SHOPIFY_STORE_URL', {
        value: 'https://test-shop.myshopify.com',
        writable: true,
      });

      const res = await request(app)
        .post('/api/shopify/auth/multipass')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          return_to: '/collections/all',
        });

      // Restore original environment variables
      Object.defineProperty(config, 'SHOPIFY_API_SECRET', {
        value: originalSecretKey,
        writable: true,
      });

      Object.defineProperty(config, 'SHOPIFY_STORE_URL', {
        value: originalStoreUrl,
        writable: true,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('multipassUrl');
      expect(res.body.data.multipassUrl).toContain('https://test-shop.myshopify.com/account/login/multipass/');
    });

    test('Should reject unauthenticated requests', async () => {
      const res = await request(app).post('/api/shopify/auth/multipass');

      expect(res.status).toBe(401);
    });
  });

  // Test manual token setting
  describe('POST /api/shopify/auth/token', () => {
    test('Should allow admins to set access token manually', async () => {
      const res = await request(app)
        .post('/api/shopify/auth/token')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          shop: 'test-shop.myshopify.com',
          accessToken: 'test_access_token',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Should reject requests without required params', async () => {
      const res = await request(app)
        .post('/api/shopify/auth/token')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('Should reject non-admin users', async () => {
      const res = await request(app)
        .post('/api/shopify/auth/token')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shop: 'test-shop.myshopify.com',
          accessToken: 'test_access_token',
        });

      expect(res.status).toBe(403);
    });
  });
}); 