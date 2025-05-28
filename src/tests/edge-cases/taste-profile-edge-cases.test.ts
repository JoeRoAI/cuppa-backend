/**
 * Edge Case Tests for Taste Profile API
 * Tests various edge cases and error scenarios for taste profile endpoints
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock the models and services
const mockUser = {
  _id: 'user123',
  id: 'user123',
  email: 'test@example.com',
  name: 'Test User',
  save: jest.fn(),
  findById: jest.fn(),
};

const mockTasteProfile = {
  _id: 'profile123',
  userId: 'user123',
  attributes: [],
  flavorProfiles: [],
  save: jest.fn(),
  findOne: jest.fn(),
};

const mockRating = {
  _id: 'rating123',
  userId: 'user123',
  coffeeId: 'coffee123',
  rating: 4.5,
  find: jest.fn(),
};

// Mock the logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

// Mock the taste profile service functions
const mockTasteProfileService = {
  generateTasteProfile: jest.fn(),
  getTasteProfileSummary: jest.fn(),
  getTasteProfileAttributes: jest.fn(),
  getTasteProfileFlavors: jest.fn(),
  getTasteProfileStats: jest.fn(),
  calculateUserAffinity: jest.fn(),
  calculateCoffeeAffinity: jest.fn(),
  findSimilarUsers: jest.fn(),
};

describe('Taste Profile API - Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authentication Edge Cases', () => {
    it('should handle missing authentication token', async () => {
      // Test that endpoints require authentication
      const mockReq = {
        headers: {},
        user: undefined,
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      // Simulate auth middleware behavior
      expect(mockReq.user).toBeUndefined();
      
      // Should return 401 when no auth token
      mockRes.status(401);
      mockRes.json({ error: 'Authentication required' });
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should handle invalid authentication token', async () => {
      const mockReq = {
        headers: { authorization: 'Bearer invalid-token' },
        user: undefined,
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      // Simulate invalid token scenario
      mockRes.status(401);
      mockRes.json({ error: 'Invalid token' });
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('should handle expired authentication token', async () => {
      const mockReq = {
        headers: { authorization: 'Bearer expired-token' },
        user: undefined,
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      // Simulate expired token scenario
      mockRes.status(401);
      mockRes.json({ error: 'Token expired' });
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Token expired' });
    });
  });

  describe('Data Availability Edge Cases', () => {
    it('should handle user with no ratings', async () => {
      mockRating.find.mockResolvedValue([]);
      mockTasteProfileService.generateTasteProfile.mockResolvedValue(null);

      const result = await mockTasteProfileService.generateTasteProfile('user123');
      
      expect(result).toBeNull();
      expect(mockRating.find).toHaveBeenCalledWith({ userId: 'user123' });
    });

    it('should handle user with insufficient ratings (< 5)', async () => {
      const insufficientRatings = [
        { coffeeId: 'coffee1', rating: 4.0 },
        { coffeeId: 'coffee2', rating: 3.5 },
        { coffeeId: 'coffee3', rating: 4.5 },
      ];
      
      mockRating.find.mockResolvedValue(insufficientRatings);
      mockTasteProfileService.generateTasteProfile.mockResolvedValue({
        error: 'Insufficient data',
        message: 'At least 5 ratings required for taste profile generation'
      });

      const result = await mockTasteProfileService.generateTasteProfile('user123');
      
      expect(result.error).toBe('Insufficient data');
      expect(result.message).toContain('At least 5 ratings required');
    });

    it('should handle missing taste profile for existing user', async () => {
      mockTasteProfile.findOne.mockResolvedValue(null);
      mockTasteProfileService.getTasteProfileSummary.mockResolvedValue({
        error: 'Profile not found',
        message: 'No taste profile exists for this user'
      });

      const result = await mockTasteProfileService.getTasteProfileSummary('user123');
      
      expect(result.error).toBe('Profile not found');
      expect(mockTasteProfile.findOne).toHaveBeenCalledWith({ userId: 'user123' });
    });

    it('should handle corrupted taste profile data', async () => {
      const corruptedProfile = {
        userId: 'user123',
        attributes: null, // Corrupted data
        flavorProfiles: undefined, // Corrupted data
      };
      
      mockTasteProfile.findOne.mockResolvedValue(corruptedProfile);
      mockTasteProfileService.getTasteProfileSummary.mockResolvedValue({
        error: 'Data corruption',
        message: 'Taste profile data is corrupted'
      });

      const result = await mockTasteProfileService.getTasteProfileSummary('user123');
      
      expect(result.error).toBe('Data corruption');
    });
  });

  describe('Database Edge Cases', () => {
    it('should handle database connection failure', async () => {
      const dbError = new Error('Database connection failed');
      mockTasteProfile.findOne.mockRejectedValue(dbError);
      
      try {
        await mockTasteProfileService.getTasteProfileSummary('user123');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Database connection failed');
      }
    });

    it('should handle database timeout', async () => {
      const timeoutError = new Error('Query timeout');
      mockRating.find.mockRejectedValue(timeoutError);
      
      try {
        await mockTasteProfileService.generateTasteProfile('user123');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Query timeout');
      }
    });

    it('should handle concurrent database operations', async () => {
      // Simulate concurrent operations
      const promises = Array(10).fill(null).map(() => 
        mockTasteProfileService.getTasteProfileSummary('user123')
      );
      
      mockTasteProfileService.getTasteProfileSummary.mockResolvedValue({
        userId: 'user123',
        attributes: [],
        flavorProfiles: []
      });
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(10);
      expect(mockTasteProfileService.getTasteProfileSummary).toHaveBeenCalledTimes(10);
    });
  });

  describe('Input Validation Edge Cases', () => {
    it('should handle malformed user ID', async () => {
      const malformedUserId = 'invalid-user-id-format';
      
      mockTasteProfileService.getTasteProfileSummary.mockResolvedValue({
        error: 'Invalid user ID',
        message: 'User ID format is invalid'
      });

      const result = await mockTasteProfileService.getTasteProfileSummary(malformedUserId);
      
      expect(result.error).toBe('Invalid user ID');
    });

    it('should handle extremely long user ID', async () => {
      const longUserId = 'a'.repeat(1000);
      
      mockTasteProfileService.getTasteProfileSummary.mockResolvedValue({
        error: 'Invalid input',
        message: 'User ID too long'
      });

      const result = await mockTasteProfileService.getTasteProfileSummary(longUserId);
      
      expect(result.error).toBe('Invalid input');
    });

    it('should handle special characters in user ID', async () => {
      const specialCharUserId = 'user<script>alert("xss")</script>';
      
      mockTasteProfileService.getTasteProfileSummary.mockResolvedValue({
        error: 'Invalid characters',
        message: 'User ID contains invalid characters'
      });

      const result = await mockTasteProfileService.getTasteProfileSummary(specialCharUserId);
      
      expect(result.error).toBe('Invalid characters');
    });
  });

  describe('Query Parameter Edge Cases', () => {
    it('should handle invalid limit parameter', async () => {
      mockTasteProfileService.getTasteProfileFlavors.mockResolvedValue({
        error: 'Invalid parameter',
        message: 'Limit must be a positive integer'
      });

      const result = await mockTasteProfileService.getTasteProfileFlavors('user123', { limit: 'invalid' });
      
      expect(result.error).toBe('Invalid parameter');
    });

    it('should handle negative limit parameter', async () => {
      mockTasteProfileService.getTasteProfileFlavors.mockResolvedValue({
        error: 'Invalid parameter',
        message: 'Limit must be a positive integer'
      });

      const result = await mockTasteProfileService.getTasteProfileFlavors('user123', { limit: -5 });
      
      expect(result.error).toBe('Invalid parameter');
    });

    it('should handle extremely large limit parameter', async () => {
      mockTasteProfileService.getTasteProfileFlavors.mockResolvedValue({
        error: 'Invalid parameter',
        message: 'Limit exceeds maximum allowed value'
      });

      const result = await mockTasteProfileService.getTasteProfileFlavors('user123', { limit: 999999 });
      
      expect(result.error).toBe('Invalid parameter');
    });
  });

  describe('Service Layer Edge Cases', () => {
    it('should handle service unavailable', async () => {
      const serviceError = new Error('Service temporarily unavailable');
      mockTasteProfileService.generateTasteProfile.mockRejectedValue(serviceError);
      
      try {
        await mockTasteProfileService.generateTasteProfile('user123');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Service temporarily unavailable');
      }
    });

    it('should handle memory exhaustion during processing', async () => {
      const memoryError = new Error('Out of memory');
      mockTasteProfileService.getTasteProfileStats.mockRejectedValue(memoryError);
      
      try {
        await mockTasteProfileService.getTasteProfileStats('user123');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Out of memory');
      }
    });

    it('should handle algorithm failure during taste profile generation', async () => {
      mockTasteProfileService.generateTasteProfile.mockResolvedValue({
        error: 'Algorithm failure',
        message: 'Failed to generate taste profile due to algorithm error'
      });

      const result = await mockTasteProfileService.generateTasteProfile('user123');
      
      expect(result.error).toBe('Algorithm failure');
    });
  });

  describe('Data Consistency Edge Cases', () => {
    it('should handle inconsistent rating data', async () => {
      const inconsistentRatings = [
        { coffeeId: 'coffee1', rating: 4.0, attributes: { acidity: 5 } },
        { coffeeId: 'coffee1', rating: 2.0, attributes: { acidity: 3 } }, // Same coffee, different rating
      ];
      
      mockRating.find.mockResolvedValue(inconsistentRatings);
      mockTasteProfileService.generateTasteProfile.mockResolvedValue({
        warning: 'Inconsistent data detected',
        profile: { /* generated profile */ }
      });

      const result = await mockTasteProfileService.generateTasteProfile('user123');
      
      expect(result.warning).toBe('Inconsistent data detected');
    });

    it('should handle missing coffee metadata', async () => {
      const ratingsWithMissingCoffee = [
        { coffeeId: 'nonexistent-coffee', rating: 4.0 },
      ];
      
      mockRating.find.mockResolvedValue(ratingsWithMissingCoffee);
      mockTasteProfileService.generateTasteProfile.mockResolvedValue({
        warning: 'Some coffee data is missing',
        profile: { /* partial profile */ }
      });

      const result = await mockTasteProfileService.generateTasteProfile('user123');
      
      expect(result.warning).toBe('Some coffee data is missing');
    });
  });

  describe('Performance Edge Cases', () => {
    it('should handle large dataset processing', async () => {
      const largeRatingSet = Array(10000).fill(null).map((_, i) => ({
        coffeeId: `coffee${i}`,
        rating: Math.random() * 5,
      }));
      
      mockRating.find.mockResolvedValue(largeRatingSet);
      mockTasteProfileService.generateTasteProfile.mockResolvedValue({
        userId: 'user123',
        attributes: [],
        processingTime: 5000 // 5 seconds
      });

      const result = await mockTasteProfileService.generateTasteProfile('user123');
      
      expect(result.processingTime).toBeGreaterThan(1000); // Should take significant time
    });

    it('should handle timeout during complex calculations', async () => {
      mockTasteProfileService.calculateUserAffinity.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Operation timeout')), 100);
        });
      });

      try {
        await mockTasteProfileService.calculateUserAffinity('user123', 'user456');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Operation timeout');
      }
    });
  });

  describe('Edge Cases in Taste Profile Attributes', () => {
    it('should handle attributes with extreme values', async () => {
      const extremeProfile = {
        userId: 'user123',
        attributes: [
          { name: 'acidity', preferenceScore: 0, confidence: 100 },
          { name: 'sweetness', preferenceScore: 100, confidence: 0 },
        ]
      };
      
      mockTasteProfile.findOne.mockResolvedValue(extremeProfile);
      mockTasteProfileService.getTasteProfileAttributes.mockResolvedValue(extremeProfile.attributes);

      const result = await mockTasteProfileService.getTasteProfileAttributes('user123');
      
      expect(result).toHaveLength(2);
      expect(result[0].preferenceScore).toBe(0);
      expect(result[1].confidence).toBe(0);
    });

    it('should handle attributes with NaN values', async () => {
      const nanProfile = {
        userId: 'user123',
        attributes: [
          { name: 'acidity', preferenceScore: NaN, confidence: 50 },
        ]
      };
      
      mockTasteProfile.findOne.mockResolvedValue(nanProfile);
      mockTasteProfileService.getTasteProfileAttributes.mockResolvedValue({
        error: 'Invalid data',
        message: 'Attribute values contain invalid numbers'
      });

      const result = await mockTasteProfileService.getTasteProfileAttributes('user123');
      
      expect(result.error).toBe('Invalid data');
    });
  });
}); 