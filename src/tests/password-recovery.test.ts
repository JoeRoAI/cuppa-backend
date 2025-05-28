import request from 'supertest';
import express from 'express';
import { app } from '../app';

describe('Password Recovery Endpoints', () => {
  const testUser = {
    email: 'test@example.com',
    password: 'password123',
    name: 'Test User'
  };

  beforeEach(async () => {
    // Register a test user before each password recovery test
    await request(app)
      .post('/api/auth/register')
      .send(testUser);
  });

  describe('Forgot Password', () => {
    it('should initiate password reset for valid email', async () => {
      const res = await request(app)
        .post('/api/auth/forgotpassword')
        .send({
          email: testUser.email
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return error for missing email', async () => {
      const res = await request(app)
        .post('/api/auth/forgotpassword')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return success for non-existent email (to prevent user enumeration)', async () => {
      const res = await request(app)
        .post('/api/auth/forgotpassword')
        .send({
          email: 'nonexistent@example.com'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should respect rate limits', async () => {
      // Send multiple requests to potentially hit rate limit
      const requests = [];
      for (let i = 0; i < 6; i++) {
        requests.push(
          request(app)
            .post('/api/auth/forgotpassword')
            .send({
              email: testUser.email
            })
        );
      }

      const responses = await Promise.all(requests);
      // At least one of the responses should be rate limited (429 status)
      const hasRateLimit = responses.some(res => res.status === 429);
      expect(hasRateLimit).toBe(true);
    });
  });

  describe('Reset Password', () => {
    let resetToken: string;
    let hashedToken: string;

    beforeEach(async () => {
      // First, trigger a password reset to get a token
      const forgotRes = await request(app)
        .post('/api/auth/forgotpassword')
        .send({
          email: testUser.email
        });

      // In a real test, we would extract the token from the response
      // For our test mock, we'll use a known test value
      resetToken = 'test-reset-token';
    });

    it('should reset password with valid token and valid password', async () => {
      const res = await request(app)
        .post('/api/auth/resetpassword')
        .send({
          email: testUser.email,
          token: resetToken,
          password: 'newpassword123',
          confirmPassword: 'newpassword123'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Should include token for automatic login
      expect(res.body.token).toBeDefined();
    });

    it('should return error for passwords that do not match', async () => {
      const res = await request(app)
        .post('/api/auth/resetpassword')
        .send({
          email: testUser.email,
          token: resetToken,
          password: 'newpassword123',
          confirmPassword: 'differentpassword'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return error for weak passwords', async () => {
      const res = await request(app)
        .post('/api/auth/resetpassword')
        .send({
          email: testUser.email,
          token: resetToken,
          password: 'short',
          confirmPassword: 'short'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return error for invalid/expired token', async () => {
      const res = await request(app)
        .post('/api/auth/resetpassword')
        .send({
          email: testUser.email,
          token: 'invalid-token',
          password: 'newpassword123',
          confirmPassword: 'newpassword123'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should be able to login with new password after reset', async () => {
      // First reset the password
      await request(app)
        .post('/api/auth/resetpassword')
        .send({
          email: testUser.email,
          token: resetToken,
          password: 'newpassword123',
          confirmPassword: 'newpassword123'
        });

      // Then try to login with the new password
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'newpassword123'
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.token).toBeDefined();
    });
  });
}); 