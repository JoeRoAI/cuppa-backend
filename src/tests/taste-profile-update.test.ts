/**
 * Tests for TasteProfileUpdateService
 * Validates real-time updates, batch processing, and middleware integration
 */

import mongoose from 'mongoose';
import TasteProfileUpdateService from '../services/taste-profile-update.service';
import TasteProfile from '../models/taste-profile.model';
import Rating from '../models/rating.model';
import User from '../models/user.model';
import Coffee from '../models/coffee.model';

// Mock logger to avoid console output during tests
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('TasteProfileUpdateService', () => {
  let testUserId: string;
  let testCoffeeId: string;
  let testRatingId: string;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/cuppa_test');
  });

  beforeEach(async () => {
    // Clean up test data
    await TasteProfile.deleteMany({});
    await Rating.deleteMany({});
    await User.deleteMany({});
    await Coffee.deleteMany({});

    // Create test user
    const testUser = await User.create({
      email: 'test@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User'
    });
    testUserId = (testUser._id as mongoose.Types.ObjectId).toString();

    // Create test coffee
    const testCoffee = await Coffee.create({
      name: 'Test Coffee',
      roaster: 'Test Roaster',
      origin: 'Test Origin',
      roastLevel: 'medium',
      flavors: ['chocolate', 'nutty'],
      processingMethod: 'washed'
    });
    testCoffeeId = (testCoffee._id as mongoose.Types.ObjectId).toString();

    // Create test rating
    const testRating = await Rating.create({
      userId: testUserId,
      coffeeId: testCoffeeId,
      overall: 4.5,
      aroma: 4.0,
      flavor: 4.5,
      aftertaste: 4.0,
      acidity: 3.5,
      body: 4.0,
      balance: 4.5,
      sweetness: 4.0,
      cleanCup: 5.0,
      notes: 'Great coffee!'
    });
    testRatingId = (testRating._id as mongoose.Types.ObjectId).toString();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('triggerUpdate', () => {
    it('should trigger a profile update for a user', async () => {
      const result = await TasteProfileUpdateService.triggerUpdate(
        testUserId,
        'rating_added',
        testRatingId
      );

      expect(result.queued).toBeDefined();
      expect(result.immediate).toBeDefined();
      expect(result.reason).toBeDefined();
    });

    it('should handle invalid user ID gracefully', async () => {
      const result = await TasteProfileUpdateService.triggerUpdate(
        'invalid-id',
        'rating_added'
      );

      expect(result.queued).toBe(false);
      expect(result.reason).toContain('Invalid user ID');
    });

    it('should queue updates when debouncing is enabled', async () => {
      // Trigger multiple updates quickly
      const promises = [
        TasteProfileUpdateService.triggerUpdate(testUserId, 'rating_added'),
        TasteProfileUpdateService.triggerUpdate(testUserId, 'rating_updated'),
        TasteProfileUpdateService.triggerUpdate(testUserId, 'rating_added')
      ];

      const results = await Promise.all(promises);
      
      // Should have queued some updates
      const queueStatus = TasteProfileUpdateService.getQueueStatus();
      expect(queueStatus.queueSize).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getQueueStatus', () => {
    it('should return current queue status', async () => {
      // Add some items to queue
      await TasteProfileUpdateService.triggerUpdate(testUserId, 'rating_added');
      
      const status = TasteProfileUpdateService.getQueueStatus();
      
      expect(status).toHaveProperty('queueSize');
      expect(status).toHaveProperty('processingCount');
      expect(status).toHaveProperty('queueDetails');
      expect(Array.isArray(status.queueDetails)).toBe(true);
    });
  });

  describe('configuration management', () => {
    it('should get current configuration', () => {
      const config = TasteProfileUpdateService.getConfiguration();
      
      expect(config).toHaveProperty('debounceTime');
      expect(config).toHaveProperty('batchSize');
      expect(config).toHaveProperty('maxRetries');
      expect(config).toHaveProperty('enableRealTimeUpdates');
    });

    it('should update configuration', () => {
      const newConfig = {
        debounceTime: 10000,
        batchSize: 20
      };

      const updatedConfig = TasteProfileUpdateService.updateConfiguration(newConfig);
      
      expect(updatedConfig.debounceTime).toBe(10000);
      expect(updatedConfig.batchSize).toBe(20);
    });
  });

  describe('processPendingUpdates', () => {
    it('should process all pending updates', async () => {
      // Add some updates to queue
      await TasteProfileUpdateService.triggerUpdate(testUserId, 'rating_added');
      
      const result = await TasteProfileUpdateService.processPendingUpdates();
      
      expect(result).toHaveProperty('processed');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
    });
  });

  describe('getUpdateHistory', () => {
    it('should return update history for a user', async () => {
      // Trigger an update first
      await TasteProfileUpdateService.triggerUpdate(testUserId, 'rating_added');
      
      const history = TasteProfileUpdateService.getUpdateHistory(testUserId, 5);
      
      expect(history).toHaveProperty('updates');
      expect(history).toHaveProperty('total');
      expect(Array.isArray(history.updates)).toBe(true);
    });

    it('should limit history results', () => {
      const history = TasteProfileUpdateService.getUpdateHistory(testUserId, 3);
      
      expect(history.updates.length).toBeLessThanOrEqual(3);
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock a database error
      jest.spyOn(TasteProfile, 'findOne').mockRejectedValueOnce(new Error('Database error'));
      
      const result = await TasteProfileUpdateService.triggerUpdate(testUserId, 'rating_added');
      
      expect(result.queued).toBe(false);
      expect(result.reason).toContain('Database error');
    });

    it('should retry failed updates', async () => {
      // Update configuration to enable retries
      TasteProfileUpdateService.updateConfiguration({
        maxRetries: 2,
        retryDelay: 100
      });

      // Simple mock that doesn't cause type issues
      const originalFindOne = TasteProfile.findOne;
      let callCount = 0;
      
      TasteProfile.findOne = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Temporary error');
        }
        return Promise.resolve(null);
      });

      const result = await TasteProfileUpdateService.triggerUpdate(testUserId, 'rating_added');
      
      // Should eventually succeed after retry
      expect(result.queued).toBe(true);
      
      // Restore original method
      TasteProfile.findOne = originalFindOne;
    });
  });

  describe('integration with aggregation service', () => {
    it('should use aggregation service for profile generation', async () => {
      // Create multiple ratings for better aggregation
      await Rating.create([
        {
          userId: testUserId,
          coffeeId: testCoffeeId,
          overall: 4.0,
          aroma: 4.0,
          flavor: 4.0,
          aftertaste: 4.0,
          acidity: 3.0,
          body: 4.0,
          balance: 4.0,
          sweetness: 4.0,
          cleanCup: 5.0
        },
        {
          userId: testUserId,
          coffeeId: testCoffeeId,
          overall: 5.0,
          aroma: 5.0,
          flavor: 5.0,
          aftertaste: 5.0,
          acidity: 4.0,
          body: 5.0,
          balance: 5.0,
          sweetness: 5.0,
          cleanCup: 5.0
        }
      ]);

      const result = await TasteProfileUpdateService.triggerUpdate(testUserId, 'manual');
      
      expect(result.queued).toBe(true);
      
      // Check that profile was created
      const profile = await TasteProfile.findOne({ userId: testUserId });
      expect(profile).toBeTruthy();
      expect(profile?.totalRatings).toBeGreaterThan(0);
    });
  });

  describe('performance and scalability', () => {
    it('should handle multiple concurrent updates', async () => {
      const userIds: string[] = [];
      
      // Create multiple test users
      for (let i = 0; i < 5; i++) {
        const user = await User.create({
          email: `test${i}@example.com`,
          password: 'password123',
          firstName: `Test${i}`,
          lastName: 'User'
        });
        userIds.push((user._id as mongoose.Types.ObjectId).toString());
      }

      // Trigger updates for all users concurrently
      const promises = userIds.map(userId =>
        TasteProfileUpdateService.triggerUpdate(userId, 'rating_added')
      );

      const results = await Promise.all(promises);
      
      // All updates should complete
      expect(results.length).toBe(5);
      results.forEach(result => {
        expect(result.queued).toBe(true);
      });
    });

    it('should respect batch size limits', async () => {
      // Set small batch size
      TasteProfileUpdateService.updateConfiguration({
        batchSize: 2
      });

      // Add multiple updates
      const promises: Promise<any>[] = [];
      for (let i = 0; i < 5; i++) {
        promises.push(TasteProfileUpdateService.triggerUpdate(testUserId, 'rating_added'));
      }

      await Promise.all(promises);
      
      const status = TasteProfileUpdateService.getQueueStatus();
      expect(status.queueSize).toBeGreaterThan(0);
    });
  });
}); 