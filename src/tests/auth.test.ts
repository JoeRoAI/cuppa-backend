import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import User from '../models/user.model';
import jwt from 'jsonwebtoken';
import config from '../config/config';
import JwtService from '../utils/jwt.service';

// Mock express app for testing
const app = express();
app.use(express.json());

// Import routes
import authRoutes from '../routes/auth.routes';

// Apply routes
app.use('/api/auth', authRoutes);

// Mock user data
const testUser = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'Password123!',
};

// Set environment to test
process.env.NODE_ENV = 'test';

describe('Authentication Endpoints', () => {
  beforeAll(async () => {
    // Connect to test database if not using mock database
    if (!process.env.USE_MOCK_DB) {
      await mongoose.connect(config.MONGO_URI_TEST as string);
    }
  });

  beforeEach(async () => {
    // Clear test data before each test if not using mock database
    if (!process.env.USE_MOCK_DB) {
      await User.deleteMany({});
    }
  });

  afterAll(async () => {
    // Disconnect from test database if not using mock database
    if (!process.env.USE_MOCK_DB) {
      await mongoose.disconnect();
    }
  });

  describe('User Registration', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it('should not register a user with an existing email', async () => {
      // First registration should succeed
      await request(app)
        .post('/api/auth/register')
        .send(testUser);

      // Second registration with same email should fail
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already exists');
    });

    it('should not register a user with missing required fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          // Missing email
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('User Login', () => {
    beforeEach(async () => {
      // Register a test user before each login test
      await request(app)
        .post('/api/auth/register')
        .send(testUser);
    });

    it('should login a registered user successfully', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it('should not login with incorrect password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should not login with non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: testUser.password,
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('JWT Token Management', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      // Register and login to get tokens
      await request(app)
        .post('/api/auth/register')
        .send(testUser);

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      accessToken = loginRes.body.token;
      refreshToken = loginRes.body.refreshToken.token;
    });

    it('should get current user with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(testUser.email);
    });

    it('should not get current user with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalidtoken');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should refresh token successfully', async () => {
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .send({
          refreshToken: refreshToken
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.accessToken).not.toBe(accessToken);
    });

    it('should revoke token successfully', async () => {
      const res = await request(app)
        .post('/api/auth/revoke-token')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          refreshToken: refreshToken
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('revoked');
    });
  });

  describe('Password Recovery', () => {
    beforeEach(async () => {
      // Register a test user before each password recovery test
      await request(app)
        .post('/api/auth/register')
        .send(testUser);
    });

    it('should initiate password reset for registered email', async () => {
      const res = await request(app)
        .post('/api/auth/forgotpassword')
        .send({
          email: testUser.email
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    // Note: Testing actual password reset would require access to the reset token
    // In a real test, you might mock the token generation or extract it from the response
  });
}); 