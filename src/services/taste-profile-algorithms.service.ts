/**
 * TasteProfileAlgorithmsService
 * Advanced algorithms for taste profile generation, user similarity, and preference modeling
 */

import mongoose from 'mongoose';
import TasteProfile, {
  ITasteProfileDocument,
  CoffeeAttribute,
  IPreferredAttribute,
  IPreferredFlavorProfile,
  IPreferredCharacteristics,
} from '../models/taste-profile.model';
import Rating from '../models/rating.model';
import Coffee from '../models/coffee.model';
import User from '../models/user.model';
import { TasteSimilarity, ItemSimilarity } from '../models/recommendation.model';
import logger from '../utils/logger';

interface UserAffinityScore {
  userId: string;
  affinityScore: number;
  sharedAttributes: string[];
  confidence: number;
}

interface CoffeeAffinityScore {
  coffeeId: string;
  affinityScore: number;
  matchingFactors: string[];
  confidence: number;
}

interface ClusterResult {
  clusterId: string;
  users: string[];
  centroid: IPreferredAttribute[];
  cohesion: number;
  characteristics: {
    dominantFlavors: string[];
    preferredOrigins: string[];
    roastLevelPreferences: string[];
  };
}

interface TasteProfileVector {
  userId: string;
  attributeVector: number[];
  flavorVector: number[];
  characteristicVector: number[];
  confidence: number;
}

class TasteProfileAlgorithmsService {
  /**
   * Calculate user-to-user taste affinity based on taste profiles
   * @param userId1 - First user ID
   * @param userId2 - Second user ID
   * @returns Affinity score between 0 and 1
   */
  async calculateUserAffinity(userId1: string, userId2: string): Promise<number> {
    try {
      const profile1 = await TasteProfile.findOne({ userId: new mongoose.Types.ObjectId(userId1) });
      const profile2 = await TasteProfile.findOne({ userId: new mongoose.Types.ObjectId(userId2) });

      if (!profile1 || !profile2) {
        return 0;
      }

      // Calculate attribute similarity using cosine similarity
      const attributeAffinity = this.calculateAttributeAffinity(
        profile1.preferredAttributes,
        profile2.preferredAttributes
      );

      // Calculate flavor profile similarity using Jaccard similarity
      const flavorAffinity = this.calculateFlavorAffinity(
        profile1.preferredFlavorProfiles,
        profile2.preferredFlavorProfiles
      );

      // Calculate characteristic similarity
      const characteristicAffinity = this.calculateCharacteristicAffinity(
        profile1.preferredCharacteristics,
        profile2.preferredCharacteristics
      );

      // Weight the different components
      const weights = {
        attributes: 0.4,
        flavors: 0.35,
        characteristics: 0.25,
      };

      const overallAffinity =
        attributeAffinity * weights.attributes +
        flavorAffinity * weights.flavors +
        characteristicAffinity * weights.characteristics;

      // Apply confidence weighting
      const confidenceWeight =
        Math.min(profile1.profileConfidence, profile2.profileConfidence) / 100;

      return Math.max(0, Math.min(1, overallAffinity * confidenceWeight));
    } catch (error) {
      logger.error(`Error calculating user affinity: ${error}`);
      return 0;
    }
  }

  /**
   * Calculate coffee-to-user affinity based on taste profile
   * @param userId - User ID
   * @param coffeeId - Coffee ID
   * @returns Affinity score between 0 and 1
   */
  async calculateCoffeeAffinity(userId: string, coffeeId: string): Promise<CoffeeAffinityScore> {
    try {
      const userProfile = await TasteProfile.findOne({
        userId: new mongoose.Types.ObjectId(userId),
      });
      const coffee = await Coffee.findById(coffeeId);

      if (!userProfile || !coffee) {
        return {
          coffeeId,
          affinityScore: 0,
          matchingFactors: [],
          confidence: 0,
        };
      }

      const matchingFactors: string[] = [];
      let totalScore = 0;
      let factorCount = 0;

      // Check roast level preference
      if (coffee.roastLevel && userProfile.preferredCharacteristics.roastLevels.length > 0) {
        const roastMatch = userProfile.preferredCharacteristics.roastLevels.find(
          (r) => r.level === coffee.roastLevel
        );
        if (roastMatch) {
          totalScore += (roastMatch.averageRating / 5) * 0.3;
          matchingFactors.push(`Preferred roast level: ${coffee.roastLevel}`);
          factorCount++;
        }
      }

      // Check origin preference
      if (coffee.origin?.country && userProfile.preferredCharacteristics.origins.length > 0) {
        const originMatch = userProfile.preferredCharacteristics.origins.find(
          (o) => o.country === coffee.origin.country
        );
        if (originMatch) {
          totalScore += (originMatch.averageRating / 5) * 0.25;
          matchingFactors.push(`Preferred origin: ${coffee.origin.country}`);
          factorCount++;
        }
      }

      // Check flavor profile matches
      if (coffee.flavorProfile?.flavorNotes && userProfile.preferredFlavorProfiles.length > 0) {
        const flavorMatches = coffee.flavorProfile.flavorNotes.filter((flavor) =>
          userProfile.preferredFlavorProfiles.some((pf) => pf.flavorNote === flavor)
        );

        if (flavorMatches.length > 0) {
          const flavorScore =
            flavorMatches.reduce((sum, flavor) => {
              const match = userProfile.preferredFlavorProfiles.find(
                (pf) => pf.flavorNote === flavor
              );
              return sum + (match ? match.preferenceScore / 100 : 0);
            }, 0) / flavorMatches.length;

          totalScore += flavorScore * 0.35;
          matchingFactors.push(`Matching flavors: ${flavorMatches.join(', ')}`);
          factorCount++;
        }
      }

      // Check processing method
      if (
        coffee.processingDetails?.method &&
        userProfile.preferredCharacteristics.processingMethods.length > 0
      ) {
        const processingMatch = userProfile.preferredCharacteristics.processingMethods.find(
          (p) => p.method === coffee.processingDetails.method
        );
        if (processingMatch) {
          totalScore += (processingMatch.averageRating / 5) * 0.1;
          matchingFactors.push(`Preferred processing: ${coffee.processingDetails.method}`);
          factorCount++;
        }
      }

      const affinityScore = factorCount > 0 ? totalScore : 0;
      const confidence = Math.min(100, userProfile.profileConfidence + factorCount * 10);

      return {
        coffeeId,
        affinityScore: Math.max(0, Math.min(1, affinityScore)),
        matchingFactors,
        confidence,
      };
    } catch (error) {
      logger.error(`Error calculating coffee affinity: ${error}`);
      return {
        coffeeId,
        affinityScore: 0,
        matchingFactors: [],
        confidence: 0,
      };
    }
  }

  /**
   * Find users with similar taste profiles using clustering
   * @param userId - Target user ID
   * @param limit - Maximum number of similar users to return
   * @returns Array of similar users with affinity scores
   */
  async findSimilarUsers(userId: string, limit: number = 10): Promise<UserAffinityScore[]> {
    try {
      const targetProfile = await TasteProfile.findOne({
        userId: new mongoose.Types.ObjectId(userId),
      });

      if (!targetProfile) {
        return [];
      }

      // Get all other user profiles with sufficient confidence
      const otherProfiles = await TasteProfile.find({
        userId: { $ne: new mongoose.Types.ObjectId(userId) },
        profileConfidence: { $gte: 30 }, // Minimum confidence threshold
        totalRatings: { $gte: 5 }, // Minimum rating threshold
      }).limit(100); // Limit for performance

      const similarities: UserAffinityScore[] = [];

      for (const profile of otherProfiles) {
        const affinity = await this.calculateUserAffinity(userId, profile.userId.toString());

        if (affinity > 0.1) {
          // Minimum similarity threshold
          const sharedAttributes = this.findSharedAttributes(
            targetProfile.preferredAttributes,
            profile.preferredAttributes
          );

          similarities.push({
            userId: profile.userId.toString(),
            affinityScore: affinity,
            sharedAttributes,
            confidence: Math.min(targetProfile.profileConfidence, profile.profileConfidence),
          });
        }
      }

      // Sort by affinity score and return top results
      return similarities.sort((a, b) => b.affinityScore - a.affinityScore).slice(0, limit);
    } catch (error) {
      logger.error(`Error finding similar users: ${error}`);
      return [];
    }
  }

  /**
   * Cluster users based on taste profiles using K-means-like algorithm
   * @param k - Number of clusters
   * @returns Array of cluster results
   */
  async clusterUsersByTaste(k: number = 5): Promise<ClusterResult[]> {
    try {
      // Get all profiles with sufficient data
      const profiles = await TasteProfile.find({
        profileConfidence: { $gte: 40 },
        totalRatings: { $gte: 10 },
      });

      if (profiles.length < k) {
        logger.warn(`Not enough profiles for clustering: ${profiles.length} < ${k}`);
        return [];
      }

      // Convert profiles to vectors for clustering
      const vectors = profiles.map((profile) => this.profileToVector(profile));

      // Initialize centroids randomly
      let centroids = this.initializeCentroids(vectors, k);
      let clusters: TasteProfileVector[][] = [];
      let converged = false;
      let iterations = 0;
      const maxIterations = 50;

      while (!converged && iterations < maxIterations) {
        // Assign vectors to nearest centroids
        clusters = this.assignToClusters(vectors, centroids);

        // Update centroids
        const newCentroids = this.updateCentroids(clusters);

        // Check for convergence
        converged = this.checkConvergence(centroids, newCentroids);
        centroids = newCentroids;
        iterations++;
      }

      // Convert clusters to result format
      const results: ClusterResult[] = [];

      for (let i = 0; i < clusters.length; i++) {
        if (clusters[i].length > 0) {
          const clusterProfiles = clusters[i];
          const characteristics = await this.analyzeClusterCharacteristics(
            clusterProfiles.map((v) => v.userId)
          );

          results.push({
            clusterId: `cluster_${i}`,
            users: clusterProfiles.map((v) => v.userId),
            centroid: this.vectorToAttributes(centroids[i]),
            cohesion: this.calculateClusterCohesion(clusterProfiles, centroids[i]),
            characteristics,
          });
        }
      }

      logger.info(
        `Successfully clustered ${profiles.length} users into ${results.length} clusters`
      );
      return results;
    } catch (error) {
      logger.error(`Error clustering users by taste: ${error}`);
      return [];
    }
  }

  /**
   * Refine a user's taste profile using collaborative filtering
   * @param userId - User ID
   * @returns Refined taste profile
   */
  async refineProfileWithCollaborativeFiltering(
    userId: string
  ): Promise<ITasteProfileDocument | null> {
    try {
      const userProfile = await TasteProfile.findOne({
        userId: new mongoose.Types.ObjectId(userId),
      });

      if (!userProfile) {
        return null;
      }

      // Find similar users
      const similarUsers = await this.findSimilarUsers(userId, 20);

      if (similarUsers.length === 0) {
        return userProfile; // No similar users found
      }

      // Get profiles of similar users
      const similarProfiles = await TasteProfile.find({
        userId: { $in: similarUsers.map((u) => new mongoose.Types.ObjectId(u.userId)) },
      });

      // Refine attributes based on similar users' preferences
      const refinedAttributes = this.refineAttributesCollaboratively(
        userProfile.preferredAttributes,
        similarProfiles,
        similarUsers
      );

      // Refine flavor preferences
      const refinedFlavors = this.refineFlavorsCollaboratively(
        userProfile.preferredFlavorProfiles,
        similarProfiles,
        similarUsers
      );

      // Update the profile
      const updatedProfile = await TasteProfile.findOneAndUpdate(
        { userId: new mongoose.Types.ObjectId(userId) },
        {
          preferredAttributes: refinedAttributes,
          preferredFlavorProfiles: refinedFlavors,
          lastCalculated: new Date(),
        },
        { new: true }
      );

      logger.info(
        `Successfully refined taste profile for user ${userId} using ${similarUsers.length} similar users`
      );
      return updatedProfile;
    } catch (error) {
      logger.error(`Error refining profile with collaborative filtering: ${error}`);
      return null;
    }
  }

  /**
   * Calculate attribute affinity between two users
   * @private
   */
  private calculateAttributeAffinity(
    attributes1: IPreferredAttribute[],
    attributes2: IPreferredAttribute[]
  ): number {
    if (attributes1.length === 0 || attributes2.length === 0) {
      return 0;
    }

    // Create vectors for cosine similarity
    const vector1: number[] = [];
    const vector2: number[] = [];

    // Ensure both vectors have the same attributes
    const allAttributes = Object.values(CoffeeAttribute);

    for (const attr of allAttributes) {
      const attr1 = attributes1.find((a) => a.attribute === attr);
      const attr2 = attributes2.find((a) => a.attribute === attr);

      vector1.push(attr1 ? attr1.preferenceScore : 50); // Default to neutral
      vector2.push(attr2 ? attr2.preferenceScore : 50);
    }

    return this.cosineSimilarity(vector1, vector2);
  }

  /**
   * Calculate flavor affinity using Jaccard similarity
   * @private
   */
  private calculateFlavorAffinity(
    flavors1: IPreferredFlavorProfile[],
    flavors2: IPreferredFlavorProfile[]
  ): number {
    if (flavors1.length === 0 || flavors2.length === 0) {
      return 0;
    }

    const set1 = new Set(flavors1.map((f) => f.flavorNote));
    const set2 = new Set(flavors2.map((f) => f.flavorNote));

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Calculate characteristic affinity
   * @private
   */
  private calculateCharacteristicAffinity(
    char1: IPreferredCharacteristics,
    char2: IPreferredCharacteristics
  ): number {
    let totalSimilarity = 0;
    let componentCount = 0;

    // Roast level similarity
    if (char1.roastLevels.length > 0 && char2.roastLevels.length > 0) {
      const roastSet1 = new Set(char1.roastLevels.map((r) => r.level));
      const roastSet2 = new Set(char2.roastLevels.map((r) => r.level));
      const roastIntersection = new Set([...roastSet1].filter((x) => roastSet2.has(x)));
      const roastUnion = new Set([...roastSet1, ...roastSet2]);
      totalSimilarity += roastIntersection.size / roastUnion.size;
      componentCount++;
    }

    // Origin similarity
    if (char1.origins.length > 0 && char2.origins.length > 0) {
      const originSet1 = new Set(char1.origins.map((o) => o.country));
      const originSet2 = new Set(char2.origins.map((o) => o.country));
      const originIntersection = new Set([...originSet1].filter((x) => originSet2.has(x)));
      const originUnion = new Set([...originSet1, ...originSet2]);
      totalSimilarity += originIntersection.size / originUnion.size;
      componentCount++;
    }

    // Processing method similarity
    if (char1.processingMethods.length > 0 && char2.processingMethods.length > 0) {
      const processSet1 = new Set(char1.processingMethods.map((p) => p.method));
      const processSet2 = new Set(char2.processingMethods.map((p) => p.method));
      const processIntersection = new Set([...processSet1].filter((x) => processSet2.has(x)));
      const processUnion = new Set([...processSet1, ...processSet2]);
      totalSimilarity += processIntersection.size / processUnion.size;
      componentCount++;
    }

    return componentCount > 0 ? totalSimilarity / componentCount : 0;
  }

  /**
   * Calculate cosine similarity between two vectors
   * @private
   */
  private cosineSimilarity(vector1: number[], vector2: number[]): number {
    if (vector1.length !== vector2.length) {
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      norm1 += vector1[i] * vector1[i];
      norm2 += vector2[i] * vector2[i];
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Find shared attributes between two users
   * @private
   */
  private findSharedAttributes(
    attributes1: IPreferredAttribute[],
    attributes2: IPreferredAttribute[]
  ): string[] {
    const shared: string[] = [];

    for (const attr1 of attributes1) {
      const attr2 = attributes2.find((a) => a.attribute === attr1.attribute);
      if (attr2 && Math.abs(attr1.preferenceScore - attr2.preferenceScore) < 20) {
        shared.push(attr1.attribute);
      }
    }

    return shared;
  }

  /**
   * Convert taste profile to vector for clustering
   * @private
   */
  private profileToVector(profile: ITasteProfileDocument): TasteProfileVector {
    const attributeVector = Object.values(CoffeeAttribute).map((attr) => {
      const found = profile.preferredAttributes.find((a) => a.attribute === attr);
      return found ? found.preferenceScore : 50;
    });

    const flavorVector = profile.preferredFlavorProfiles
      .slice(0, 20) // Top 20 flavors
      .map((f) => f.preferenceScore);

    const characteristicVector = [
      ...profile.preferredCharacteristics.roastLevels.slice(0, 5).map((r) => r.averageRating * 20),
      ...profile.preferredCharacteristics.origins.slice(0, 5).map((o) => o.averageRating * 20),
      ...profile.preferredCharacteristics.processingMethods
        .slice(0, 3)
        .map((p) => p.averageRating * 20),
    ];

    return {
      userId: profile.userId.toString(),
      attributeVector,
      flavorVector,
      characteristicVector,
      confidence: profile.profileConfidence,
    };
  }

  /**
   * Initialize centroids for clustering
   * @private
   */
  private initializeCentroids(vectors: TasteProfileVector[], k: number): number[][] {
    const centroids: number[][] = [];
    const vectorLength = vectors[0].attributeVector.length;

    for (let i = 0; i < k; i++) {
      const centroid: number[] = [];
      for (let j = 0; j < vectorLength; j++) {
        centroid.push(Math.random() * 100); // Random values between 0-100
      }
      centroids.push(centroid);
    }

    return centroids;
  }

  /**
   * Assign vectors to nearest centroids
   * @private
   */
  private assignToClusters(
    vectors: TasteProfileVector[],
    centroids: number[][]
  ): TasteProfileVector[][] {
    const clusters: TasteProfileVector[][] = Array(centroids.length)
      .fill(null)
      .map(() => []);

    for (const vector of vectors) {
      let nearestCentroid = 0;
      let minDistance = Infinity;

      for (let i = 0; i < centroids.length; i++) {
        const distance = this.euclideanDistance(vector.attributeVector, centroids[i]);
        if (distance < minDistance) {
          minDistance = distance;
          nearestCentroid = i;
        }
      }

      clusters[nearestCentroid].push(vector);
    }

    return clusters;
  }

  /**
   * Update centroids based on cluster assignments
   * @private
   */
  private updateCentroids(clusters: TasteProfileVector[][]): number[][] {
    const newCentroids: number[][] = [];

    for (const cluster of clusters) {
      if (cluster.length === 0) {
        // Keep the old centroid if cluster is empty
        newCentroids.push(Array(9).fill(50)); // Default neutral values
        continue;
      }

      const centroid: number[] = [];
      const vectorLength = cluster[0].attributeVector.length;

      for (let i = 0; i < vectorLength; i++) {
        const sum = cluster.reduce((acc, vector) => acc + vector.attributeVector[i], 0);
        centroid.push(sum / cluster.length);
      }

      newCentroids.push(centroid);
    }

    return newCentroids;
  }

  /**
   * Check if centroids have converged
   * @private
   */
  private checkConvergence(oldCentroids: number[][], newCentroids: number[][]): boolean {
    const threshold = 1.0; // Convergence threshold

    for (let i = 0; i < oldCentroids.length; i++) {
      const distance = this.euclideanDistance(oldCentroids[i], newCentroids[i]);
      if (distance > threshold) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate Euclidean distance between two vectors
   * @private
   */
  private euclideanDistance(vector1: number[], vector2: number[]): number {
    let sum = 0;
    for (let i = 0; i < vector1.length; i++) {
      sum += Math.pow(vector1[i] - vector2[i], 2);
    }
    return Math.sqrt(sum);
  }

  /**
   * Convert vector back to attributes
   * @private
   */
  private vectorToAttributes(vector: number[]): IPreferredAttribute[] {
    const attributes = Object.values(CoffeeAttribute);
    return attributes.map((attr, index) => ({
      attribute: attr,
      preferenceScore: vector[index] || 50,
      confidence: 70, // Default confidence for centroids
      averageRating: (vector[index] || 50) / 20, // Convert to 1-5 scale
      ratingCount: 0,
    }));
  }

  /**
   * Analyze characteristics of a cluster
   * @private
   */
  private async analyzeClusterCharacteristics(
    userIds: string[]
  ): Promise<ClusterResult['characteristics']> {
    const profiles = await TasteProfile.find({
      userId: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
    });

    const allFlavors: string[] = [];
    const allOrigins: string[] = [];
    const allRoastLevels: string[] = [];

    profiles.forEach((profile) => {
      profile.preferredFlavorProfiles.forEach((f) => allFlavors.push(f.flavorNote));
      profile.preferredCharacteristics.origins.forEach((o) => allOrigins.push(o.country));
      profile.preferredCharacteristics.roastLevels.forEach((r) => allRoastLevels.push(r.level));
    });

    return {
      dominantFlavors: this.getMostFrequent(allFlavors, 5),
      preferredOrigins: this.getMostFrequent(allOrigins, 5),
      roastLevelPreferences: this.getMostFrequent(allRoastLevels, 3),
    };
  }

  /**
   * Get most frequent items from an array
   * @private
   */
  private getMostFrequent(items: string[], limit: number): string[] {
    const frequency: { [key: string]: number } = {};

    items.forEach((item) => {
      frequency[item] = (frequency[item] || 0) + 1;
    });

    return Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([item]) => item);
  }

  /**
   * Calculate cluster cohesion
   * @private
   */
  private calculateClusterCohesion(cluster: TasteProfileVector[], centroid: number[]): number {
    if (cluster.length === 0) return 0;

    const distances = cluster.map((vector) =>
      this.euclideanDistance(vector.attributeVector, centroid)
    );

    const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;

    // Convert to cohesion score (lower distance = higher cohesion)
    return Math.max(0, 1 - avgDistance / 100);
  }

  /**
   * Refine attributes using collaborative filtering
   * @private
   */
  private refineAttributesCollaboratively(
    userAttributes: IPreferredAttribute[],
    similarProfiles: ITasteProfileDocument[],
    similarUsers: UserAffinityScore[]
  ): IPreferredAttribute[] {
    const refinedAttributes: IPreferredAttribute[] = [];

    for (const userAttr of userAttributes) {
      let weightedSum = userAttr.preferenceScore * 0.6; // Give user's own preference 60% weight
      let totalWeight = 0.6;

      // Add weighted contributions from similar users
      for (const similarUser of similarUsers) {
        const similarProfile = similarProfiles.find(
          (p) => p.userId.toString() === similarUser.userId
        );

        if (similarProfile) {
          const similarAttr = similarProfile.preferredAttributes.find(
            (a) => a.attribute === userAttr.attribute
          );

          if (similarAttr) {
            const weight = similarUser.affinityScore * 0.4; // Similar users get up to 40% weight
            weightedSum += similarAttr.preferenceScore * weight;
            totalWeight += weight;
          }
        }
      }

      const refinedScore = totalWeight > 0 ? weightedSum / totalWeight : userAttr.preferenceScore;

      refinedAttributes.push({
        ...userAttr,
        preferenceScore: Math.round(refinedScore),
        confidence: Math.min(100, userAttr.confidence + 10), // Boost confidence slightly
      });
    }

    return refinedAttributes;
  }

  /**
   * Refine flavors using collaborative filtering
   * @private
   */
  private refineFlavorsCollaboratively(
    userFlavors: IPreferredFlavorProfile[],
    similarProfiles: ITasteProfileDocument[],
    similarUsers: UserAffinityScore[]
  ): IPreferredFlavorProfile[] {
    const flavorMap = new Map<string, { score: number; frequency: number; rating: number }>();

    // Initialize with user's own flavors
    userFlavors.forEach((flavor) => {
      flavorMap.set(flavor.flavorNote, {
        score: flavor.preferenceScore * 0.6,
        frequency: flavor.frequency,
        rating: flavor.averageRating,
      });
    });

    // Add flavors from similar users
    for (const similarUser of similarUsers) {
      const similarProfile = similarProfiles.find(
        (p) => p.userId.toString() === similarUser.userId
      );

      if (similarProfile) {
        const weight = similarUser.affinityScore * 0.4;

        similarProfile.preferredFlavorProfiles.forEach((flavor) => {
          const existing = flavorMap.get(flavor.flavorNote);

          if (existing) {
            // Boost existing flavor
            existing.score += flavor.preferenceScore * weight;
            existing.frequency += flavor.frequency * weight;
            existing.rating = (existing.rating + flavor.averageRating) / 2;
          } else if (flavor.preferenceScore > 70) {
            // Add new high-preference flavor
            flavorMap.set(flavor.flavorNote, {
              score: flavor.preferenceScore * weight,
              frequency: flavor.frequency * weight,
              rating: flavor.averageRating,
            });
          }
        });
      }
    }

    // Convert back to array and sort by score
    return Array.from(flavorMap.entries())
      .map(([flavorNote, data]) => ({
        flavorNote,
        preferenceScore: Math.round(data.score),
        frequency: Math.round(data.frequency),
        averageRating: data.rating,
      }))
      .filter((f) => f.preferenceScore > 30) // Filter out low-preference flavors
      .sort((a, b) => b.preferenceScore - a.preferenceScore)
      .slice(0, 25); // Keep top 25 flavors
  }
}

export default new TasteProfileAlgorithmsService();
