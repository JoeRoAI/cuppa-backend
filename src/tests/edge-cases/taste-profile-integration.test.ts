/**
 * Integration Edge Case Tests for Taste Profile System
 * Tests complex scenarios involving real database connections, concurrent operations,
 * memory pressure, and data consistency issues
 */

import { describe, it, expect, jest, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import TasteProfileService from '../../services/taste-profile.service';
import TasteProfileUpdateService from '../../services/taste-profile-update.service';
import User from '../../models/User';
import Rating from '../../models/Rating';
import TasteProfile from '../../models/TasteProfile';
import Coffee from '../../models/Coffee';
import logger from '../../utils/logger';

// Mock logger to prevent console spam during tests
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('Taste Profile Integration Edge Cases', () => {
  let mongoServer: MongoMemoryServer;
  let testUserId: string;
  let testCoffeeIds: string[] = [];

  beforeAll(async () => {
    // Start in-memory MongoDB instance
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    // Connect to the in-memory database
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    // Clean up
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all collections
    await User.deleteMany({});
    await Rating.deleteMany({});
    await TasteProfile.deleteMany({});
    await Coffee.deleteMany({});

    // Create test user
    const testUser = await User.create({
      email: 'test@example.com',
      name: 'Test User',
      password: 'hashedpassword',
    });
    testUserId = testUser._id.toString();

    // Create test coffees
    const coffees = await Coffee.insertMany([
      {
        name: 'Ethiopian Yirgacheffe',
        roastLevel: 'light',
        origin: 'Ethiopia',
        processingMethod: 'washed',
        flavorNotes: ['floral', 'citrus', 'tea-like'],
        attributes: { acidity: 8, body: 4, sweetness: 6 }
      },
      {
        name: 'Colombian Supremo',
        roastLevel: 'medium',
        origin: 'Colombia',
        processingMethod: 'washed',
        flavorNotes: ['chocolate', 'nutty', 'caramel'],
        attributes: { acidity: 6, body: 7, sweetness: 7 }
      },
      {
        name: 'French Roast',
        roastLevel: 'dark',
        origin: 'Brazil',
        processingMethod: 'natural',
        flavorNotes: ['smoky', 'bitter', 'earthy'],
        attributes: { acidity: 3, body: 9, sweetness: 4 }
      }
    ]);
    testCoffeeIds = coffees.map(coffee => coffee._id.toString());
  });

  afterEach(async () => {
    // Clean up after each test
    await User.deleteMany({});
    await Rating.deleteMany({});
    await TasteProfile.deleteMany({});
    await Coffee.deleteMany({});
  });

  describe('Database Connection Edge Cases', () => {
    it('should handle database connection loss during profile generation', async () => {
      // Create some ratings first
      await Rating.insertMany([
        { userId: testUserId, coffeeId: testCoffeeIds[0], rating: 4.5, notes: 'Great coffee' },
        { userId: testUserId, coffeeId: testCoffeeIds[1], rating: 4.0, notes: 'Good balance' },
        { userId: testUserId, coffeeId: testCoffeeIds[2], rating: 3.5, notes: 'Too dark' },
      ]);

      // Simulate connection loss by closing the connection
      await mongoose.connection.close();

      try {
        await TasteProfileService.generateTasteProfile(testUserId);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('connection');
      }

      // Reconnect for cleanup
      await mongoose.connect(mongoServer.getUri());
    });

    it('should handle database timeout during aggregation', async () => {
      // Create a large number of ratings to simulate slow query
      const largeRatingSet = Array(100).fill(null).map((_, i) => ({
        userId: testUserId,
        coffeeId: testCoffeeIds[i % testCoffeeIds.length],
        rating: Math.random() * 5,
        notes: `Rating ${i}`,
        createdAt: new Date(Date.now() - i * 1000)
      }));

      await Rating.insertMany(largeRatingSet);

      // Mock mongoose to simulate timeout
      const originalAggregate = Rating.aggregate;
      Rating.aggregate = jest.fn().mockImplementation(() => {
        throw new Error('Query timeout');
      });

      try {
        await TasteProfileService.generateTasteProfile(testUserId);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Query timeout');
      }

      // Restore original method
      Rating.aggregate = originalAggregate;
    });

    it('should handle corrupted database indexes', async () => {
      // Create ratings
      await Rating.insertMany([
        { userId: testUserId, coffeeId: testCoffeeIds[0], rating: 4.5 },
        { userId: testUserId, coffeeId: testCoffeeIds[1], rating: 4.0 },
      ]);

      // Simulate index corruption by mocking the find method to throw a specific error
      const originalFind = Rating.find;
      Rating.find = jest.fn().mockImplementation(() => {
        throw new Error('Index corruption detected');
      });

      try {
        await TasteProfileService.generateTasteProfile(testUserId);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Index corruption detected');
      }

      // Restore original method
      Rating.find = originalFind;
    });
  });

  describe('Concurrent Operation Edge Cases', () => {
    it('should handle simultaneous profile generation requests', async () => {
      // Create ratings
      await Rating.insertMany([
        { userId: testUserId, coffeeId: testCoffeeIds[0], rating: 4.5 },
        { userId: testUserId, coffeeId: testCoffeeIds[1], rating: 4.0 },
        { userId: testUserId, coffeeId: testCoffeeIds[2], rating: 3.5 },
      ]);

      // Launch multiple concurrent profile generation requests
      const concurrentRequests = Array(5).fill(null).map(() =>
        TasteProfileService.generateTasteProfile(testUserId)
      );

      const results = await Promise.allSettled(concurrentRequests);

      // At least one should succeed
      const successfulResults = results.filter(result => result.status === 'fulfilled');
      expect(successfulResults.length).toBeGreaterThan(0);

      // Check for race condition issues
      const profiles = await TasteProfile.find({ userId: testUserId });
      expect(profiles.length).toBeLessThanOrEqual(1); // Should not create duplicates
    });

    it('should handle race conditions in profile updates', async () => {
      // Create initial profile
      await TasteProfile.create({
        userId: testUserId,
        attributes: [{ attribute: 'acidity', preferenceScore: 50, confidence: 60 }],
        flavorProfiles: [],
        lastUpdated: new Date(),
      });

      // Create multiple rating updates that should trigger profile updates
      const updatePromises = Array(10).fill(null).map(async (_, i) => {
        const rating = await Rating.create({
          userId: testUserId,
          coffeeId: testCoffeeIds[i % testCoffeeIds.length],
          rating: Math.random() * 5,
          notes: `Concurrent rating ${i}`,
        });

        return TasteProfileUpdateService.triggerUpdate(
          testUserId,
          'rating_added',
          rating._id.toString(),
          { source: 'concurrent_test' }
        );
      });

      await Promise.allSettled(updatePromises);

      // Verify profile integrity
      const profiles = await TasteProfile.find({ userId: testUserId });
      expect(profiles.length).toBe(1); // Should not create duplicates

      const profile = profiles[0];
      expect(profile.attributes).toBeDefined();
      expect(Array.isArray(profile.attributes)).toBe(true);
    });

    it('should handle concurrent read/write operations', async () => {
      // Create initial data
      await Rating.insertMany([
        { userId: testUserId, coffeeId: testCoffeeIds[0], rating: 4.5 },
        { userId: testUserId, coffeeId: testCoffeeIds[1], rating: 4.0 },
      ]);

      // Mix of read and write operations
      const operations = [
        // Read operations
        () => TasteProfileService.getTasteProfileSummary(testUserId),
        () => TasteProfileService.getTasteProfileAttributes(testUserId),
        () => TasteProfileService.getTasteProfileFlavors(testUserId),
        // Write operations
        () => TasteProfileService.generateTasteProfile(testUserId),
        () => Rating.create({
          userId: testUserId,
          coffeeId: testCoffeeIds[2],
          rating: 3.5,
          notes: 'Concurrent write'
        }),
      ];

      const results = await Promise.allSettled(
        operations.map(op => op())
      );

      // Check that operations completed without deadlocks
      expect(results.length).toBe(operations.length);
      
      // At least some operations should succeed
      const successfulResults = results.filter(result => result.status === 'fulfilled');
      expect(successfulResults.length).toBeGreaterThan(0);
    });
  });

  describe('Memory and Performance Edge Cases', () => {
    it('should handle large dataset processing without memory leaks', async () => {
      // Create a large number of ratings
      const largeDataset = Array(1000).fill(null).map((_, i) => ({
        userId: testUserId,
        coffeeId: testCoffeeIds[i % testCoffeeIds.length],
        rating: Math.random() * 5,
        notes: `Large dataset rating ${i}`,
        createdAt: new Date(Date.now() - i * 1000),
      }));

      await Rating.insertMany(largeDataset);

      // Monitor memory usage (simplified)
      const initialMemory = process.memoryUsage().heapUsed;

      const profile = await TasteProfileService.generateTasteProfile(testUserId);

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 100MB for this test)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
      expect(profile).toBeDefined();
    });

    it('should handle processing timeout gracefully', async () => {
      // Create ratings
      await Rating.insertMany([
        { userId: testUserId, coffeeId: testCoffeeIds[0], rating: 4.5 },
        { userId: testUserId, coffeeId: testCoffeeIds[1], rating: 4.0 },
      ]);

      // Mock a slow operation
      const originalGenerateProfile = TasteProfileService.generateTasteProfile;
      TasteProfileService.generateTasteProfile = jest.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Processing timeout')), 100);
        });
      });

      try {
        await TasteProfileService.generateTasteProfile(testUserId);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Processing timeout');
      }

      // Restore original method
      TasteProfileService.generateTasteProfile = originalGenerateProfile;
    });
  });

  describe('Data Consistency Edge Cases', () => {
    it('should handle inconsistent rating data', async () => {
      // Create inconsistent ratings (same coffee, different attributes)
      await Rating.insertMany([
        {
          userId: testUserId,
          coffeeId: testCoffeeIds[0],
          rating: 4.5,
          notes: 'Love this coffee',
          attributes: { acidity: 8, body: 6 }
        },
        {
          userId: testUserId,
          coffeeId: testCoffeeIds[0], // Same coffee
          rating: 2.0, // Very different rating
          notes: 'Hate this coffee',
          attributes: { acidity: 3, body: 9 } // Different attributes
        },
      ]);

      const profile = await TasteProfileService.generateTasteProfile(testUserId);

      expect(profile).toBeDefined();
      // Should handle inconsistency gracefully, possibly by averaging or using latest
      expect(profile.attributes).toBeDefined();
      expect(Array.isArray(profile.attributes)).toBe(true);
    });

    it('should handle missing coffee metadata', async () => {
      // Create rating for non-existent coffee
      await Rating.create({
        userId: testUserId,
        coffeeId: new mongoose.Types.ObjectId().toString(), // Non-existent coffee
        rating: 4.0,
        notes: 'Rating for missing coffee',
      });

      // Also create valid ratings
      await Rating.insertMany([
        { userId: testUserId, coffeeId: testCoffeeIds[0], rating: 4.5 },
        { userId: testUserId, coffeeId: testCoffeeIds[1], rating: 4.0 },
      ]);

      const profile = await TasteProfileService.generateTasteProfile(testUserId);

      expect(profile).toBeDefined();
      // Should generate profile from valid data, ignoring missing coffee
      expect(profile.attributes).toBeDefined();
    });

    it('should handle corrupted profile data during update', async () => {
      // Create corrupted profile
      await TasteProfile.create({
        userId: testUserId,
        attributes: null, // Corrupted
        flavorProfiles: undefined, // Corrupted
        lastUpdated: new Date(),
      });

      // Create new rating that should trigger update
      const rating = await Rating.create({
        userId: testUserId,
        coffeeId: testCoffeeIds[0],
        rating: 4.5,
        notes: 'New rating',
      });

      // Should handle corrupted data and regenerate
      await TasteProfileUpdateService.triggerUpdate(
        testUserId,
        'rating_added',
        rating._id.toString(),
        { source: 'corruption_test' }
      );

      const updatedProfile = await TasteProfile.findOne({ userId: testUserId });
      expect(updatedProfile).toBeDefined();
      // Should have valid structure after regeneration
      expect(updatedProfile!.attributes).toBeDefined();
      expect(Array.isArray(updatedProfile!.attributes)).toBe(true);
    });
  });

  describe('Queue and Update Edge Cases', () => {
    it('should handle update queue overflow', async () => {
      // Create many rapid updates
      const rapidUpdates = Array(50).fill(null).map(async (_, i) => {
        const rating = await Rating.create({
          userId: testUserId,
          coffeeId: testCoffeeIds[i % testCoffeeIds.length],
          rating: Math.random() * 5,
          notes: `Rapid update ${i}`,
        });

        return TasteProfileUpdateService.triggerUpdate(
          testUserId,
          'rating_added',
          rating._id.toString(),
          { source: 'overflow_test' }
        );
      });

      const results = await Promise.allSettled(rapidUpdates);

      // Should handle all updates without crashing
      expect(results.length).toBe(50);
      
      // Final profile should be consistent
      const finalProfile = await TasteProfile.findOne({ userId: testUserId });
      expect(finalProfile).toBeDefined();
    });

    it('should handle debouncing edge cases', async () => {
      // Create rapid successive updates within debounce window
      const rating1 = await Rating.create({
        userId: testUserId,
        coffeeId: testCoffeeIds[0],
        rating: 4.0,
        notes: 'First rating',
      });

      const rating2 = await Rating.create({
        userId: testUserId,
        coffeeId: testCoffeeIds[1],
        rating: 4.5,
        notes: 'Second rating',
      });

      // Trigger updates rapidly
      const update1 = TasteProfileUpdateService.triggerUpdate(
        testUserId,
        'rating_added',
        rating1._id.toString(),
        { source: 'debounce_test_1' }
      );

      const update2 = TasteProfileUpdateService.triggerUpdate(
        testUserId,
        'rating_added',
        rating2._id.toString(),
        { source: 'debounce_test_2' }
      );

      await Promise.all([update1, update2]);

      // Should result in a single, consistent profile
      const profiles = await TasteProfile.find({ userId: testUserId });
      expect(profiles.length).toBeLessThanOrEqual(1);
    });
  });
}); 