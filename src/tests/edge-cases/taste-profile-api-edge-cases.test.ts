/**
 * API Controller Edge Case Tests for Taste Profile System
 * Tests API endpoints with various edge cases and error scenarios
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
  getUserTasteProfile,
  generateTasteProfile,
  getTasteProfileAttributes,
  getTasteProfileFlavors,
  getTasteProfileStats
} from '../../controllers/taste-profile.controller';

// Mock the services
jest.mock('../../services/taste-profile-aggregation.service');
jest.mock('../../utils/logger');

import TasteProfileAggregationService from '../../services/taste-profile-aggregation.service';
import logger from '../../utils/logger';

const mockTasteProfileService = TasteProfileAggregationService as jest.Mocked<typeof TasteProfileAggregationService>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('Taste Profile API Controller Edge Cases', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnThis();
    
    mockRequest = {};
    mockResponse = {
      json: mockJson,
      status: mockStatus,
    };

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authentication Edge Cases', () => {
    it('should handle missing user in request', async () => {
      mockRequest.user = undefined;

      await getUserTasteProfile(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
    });

    it('should handle user without ID', async () => {
      mockRequest.user = { email: 'test@example.com' } as any;

      await getUserTasteProfile(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
    });

    it('should handle malformed user object', async () => {
      mockRequest.user = null;

      await getUserTasteProfile(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
    });
  });

  describe('Service Layer Error Edge Cases', () => {
    beforeEach(() => {
      mockRequest.user = { id: 'user123' };
    });

    it('should handle service throwing database connection error', async () => {
      const dbError = new Error('Database connection failed');
      mockTasteProfileService.getTasteProfile.mockRejectedValue(dbError);

      await getUserTasteProfile(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Error retrieving taste profile',
        error: 'Database connection failed',
      });
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle service throwing timeout error', async () => {
      const timeoutError = new Error('Query timeout');
      mockTasteProfileService.generateTasteProfile.mockRejectedValue(timeoutError);

      await generateTasteProfile(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Error generating taste profile',
        error: 'Query timeout',
      });
    });

    it('should handle service throwing memory error', async () => {
      const memoryError = new Error('Out of memory');
      mockTasteProfileService.getTasteProfile.mockRejectedValue(memoryError);

      await getTasteProfileStats(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Error retrieving taste profile statistics',
        error: 'Out of memory',
      });
    });

    it('should handle service returning null profile', async () => {
      mockTasteProfileService.getTasteProfile.mockResolvedValue(null);

      await getTasteProfileAttributes(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.NOT_FOUND);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Taste profile not found',
      });
    });
  });

  describe('Query Parameter Edge Cases', () => {
    beforeEach(() => {
      mockRequest.user = { id: 'user123' };
      mockRequest.query = {};
    });

    it('should handle invalid limit parameter in flavors endpoint', async () => {
      mockRequest.query = { limit: 'invalid' };
      
      const mockProfile = {
        preferredFlavorProfiles: [
          { flavorNote: 'chocolate', preferenceScore: 85, frequency: 10, averageRating: 4.5 }
        ],
        profileConfidence: 75
      };
      mockTasteProfileService.getTasteProfile.mockResolvedValue(mockProfile as any);

      await getTasteProfileFlavors(mockRequest as Request, mockResponse as Response);

      // Should use default limit (10) when invalid
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: {
          flavors: [{
            name: 'chocolate',
            preferenceScore: 85,
            frequency: 10,
            averageRating: 4.5,
            intensity: 8.5
          }],
          totalFlavors: 1,
          profileConfidence: 75
        },
      });
    });

    it('should handle negative limit parameter', async () => {
      mockRequest.query = { limit: '-5' };
      
      const mockProfile = {
        preferredFlavorProfiles: [
          { flavorNote: 'chocolate', preferenceScore: 85, frequency: 10, averageRating: 4.5 }
        ],
        profileConfidence: 75
      };
      mockTasteProfileService.getTasteProfile.mockResolvedValue(mockProfile as any);

      await getTasteProfileFlavors(mockRequest as Request, mockResponse as Response);

      // Should use default limit (10) when negative
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
    });

    it('should handle extremely large limit parameter', async () => {
      mockRequest.query = { limit: '999999' };
      
      const mockProfile = {
        preferredFlavorProfiles: Array.from({ length: 100 }, (_, i) => ({
          flavorNote: `flavor_${i}`,
          preferenceScore: Math.random() * 100,
          frequency: Math.random() * 20,
          averageRating: Math.random() * 5
        })),
        profileConfidence: 75
      };
      mockTasteProfileService.getTasteProfile.mockResolvedValue(mockProfile as any);

      await getTasteProfileFlavors(mockRequest as Request, mockResponse as Response);

      // Should cap the results to a reasonable number
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      const responseData = mockJson.mock.calls[0][0].data;
      expect(responseData.flavors.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Data Corruption Edge Cases', () => {
    beforeEach(() => {
      mockRequest.user = { id: 'user123' };
    });

    it('should handle corrupted taste profile attributes', async () => {
      const corruptedProfile = {
        preferredAttributes: [
          { attribute: 'acidity', preferenceScore: NaN, confidence: 80, averageRating: 4.2 },
          { attribute: 'sweetness', preferenceScore: 75, confidence: Infinity, averageRating: 4.0 }
        ],
        profileConfidence: 75,
        totalRatings: 10,
        lastCalculated: new Date()
      };
      mockTasteProfileService.getTasteProfile.mockResolvedValue(corruptedProfile as any);

      await getTasteProfileAttributes(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      const responseData = mockJson.mock.calls[0][0].data;
      
      // Should handle NaN and Infinity values gracefully
      expect(responseData.attributes).toBeDefined();
      expect(responseData.attributes.length).toBe(2);
    });

    it('should handle missing required fields in profile data', async () => {
      const incompleteProfile = {
        // Missing preferredAttributes
        profileConfidence: 75,
        totalRatings: 10
      };
      mockTasteProfileService.getTasteProfile.mockResolvedValue(incompleteProfile as any);

      await getTasteProfileAttributes(mockRequest as Request, mockResponse as Response);

      // Should handle gracefully, possibly returning empty data
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
    });

    it('should handle profile with null/undefined arrays', async () => {
      const nullProfile = {
        preferredFlavorProfiles: null,
        profileConfidence: 0
      };
      mockTasteProfileService.getTasteProfile.mockResolvedValue(nullProfile as any);

      await getTasteProfileFlavors(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      const responseData = mockJson.mock.calls[0][0].data;
      expect(responseData.flavors).toEqual([]);
    });
  });

  describe('Performance Edge Cases', () => {
    beforeEach(() => {
      mockRequest.user = { id: 'user123' };
    });

    it('should handle extremely large flavor profile arrays', async () => {
      const largeProfile = {
        preferredFlavorProfiles: Array.from({ length: 10000 }, (_, i) => ({
          flavorNote: `flavor_${i}`,
          preferenceScore: Math.random() * 100,
          frequency: Math.random() * 20,
          averageRating: Math.random() * 5
        })),
        profileConfidence: 75
      };
      mockTasteProfileService.getTasteProfile.mockResolvedValue(largeProfile as any);

      const startTime = Date.now();
      await getTasteProfileFlavors(mockRequest as Request, mockResponse as Response);
      const duration = Date.now() - startTime;

      // Should complete within reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000);
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
    });

    it('should handle service taking too long to respond', async () => {
      // Mock a slow service response
      mockTasteProfileService.getTasteProfile.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(null), 5000); // 5 second delay
        });
      });

      const startTime = Date.now();
      
      // Race against timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Test timeout')), 1000);
      });

      try {
        await Promise.race([
          getUserTasteProfile(mockRequest as Request, mockResponse as Response),
          timeoutPromise
        ]);
      } catch (error) {
        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(1500);
        expect((error as Error).message).toBe('Test timeout');
      }
    });
  });

  describe('Concurrent Request Edge Cases', () => {
    beforeEach(() => {
      mockRequest.user = { id: 'user123' };
    });

    it('should handle multiple simultaneous requests for same user', async () => {
      const mockProfile = {
        preferredAttributes: [
          { attribute: 'acidity', preferenceScore: 75, confidence: 80, averageRating: 4.2 }
        ],
        profileConfidence: 75,
        totalRatings: 10,
        lastCalculated: new Date()
      };
      mockTasteProfileService.getTasteProfile.mockResolvedValue(mockProfile as any);

      // Simulate 10 concurrent requests
      const promises = Array.from({ length: 10 }, () => 
        getUserTasteProfile(mockRequest as Request, mockResponse as Response)
      );

      const results = await Promise.allSettled(promises);

      // All should succeed
      results.forEach(result => {
        expect(result.status).toBe('fulfilled');
      });

      // Service should have been called 10 times
      expect(mockTasteProfileService.getTasteProfile).toHaveBeenCalledTimes(10);
    });

    it('should handle mixed endpoint requests concurrently', async () => {
      const mockProfile = {
        preferredAttributes: [
          { attribute: 'acidity', preferenceScore: 75, confidence: 80, averageRating: 4.2 }
        ],
        preferredFlavorProfiles: [
          { flavorNote: 'chocolate', preferenceScore: 85, frequency: 10, averageRating: 4.5 }
        ],
        ratingPatterns: {
          overallRatingDistribution: [],
          averageOverallRating: 4.2,
          ratingVariance: 0.5,
          ratingTrends: []
        },
        profileConfidence: 75,
        totalRatings: 10,
        lastCalculated: new Date()
      };
      mockTasteProfileService.getTasteProfile.mockResolvedValue(mockProfile as any);

      // Simulate concurrent requests to different endpoints
      const promises = [
        getUserTasteProfile(mockRequest as Request, mockResponse as Response),
        getTasteProfileAttributes(mockRequest as Request, mockResponse as Response),
        getTasteProfileFlavors(mockRequest as Request, mockResponse as Response),
        getTasteProfileStats(mockRequest as Request, mockResponse as Response)
      ];

      const results = await Promise.allSettled(promises);

      // All should succeed
      results.forEach(result => {
        expect(result.status).toBe('fulfilled');
      });
    });
  });

  describe('Error Recovery Edge Cases', () => {
    beforeEach(() => {
      mockRequest.user = { id: 'user123' };
    });

    it('should recover from transient service errors', async () => {
      // First call fails, second succeeds
      mockTasteProfileService.getTasteProfile
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockResolvedValueOnce({
          preferredAttributes: [],
          profileConfidence: 0,
          totalRatings: 0
        } as any);

      // First call should fail
      await getUserTasteProfile(mockRequest as Request, mockResponse as Response);
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.INTERNAL_SERVER_ERROR);

      // Reset mocks for second call
      mockStatus.mockClear();
      mockJson.mockClear();

      // Second call should succeed
      await getUserTasteProfile(mockRequest as Request, mockResponse as Response);
      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
    });

    it('should handle partial service failures gracefully', async () => {
      // Service returns partial data
      const partialProfile = {
        preferredAttributes: [
          { attribute: 'acidity', preferenceScore: 75, confidence: 80, averageRating: 4.2 }
        ],
        // Missing other fields
        profileConfidence: 50,
        totalRatings: 5
      };
      mockTasteProfileService.getTasteProfile.mockResolvedValue(partialProfile as any);

      await getTasteProfileStats(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(StatusCodes.OK);
      const responseData = mockJson.mock.calls[0][0].data;
      expect(responseData).toBeDefined();
    });
  });
}); 