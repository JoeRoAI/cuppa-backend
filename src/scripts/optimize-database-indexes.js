/**
 * Database Index Optimization Script for Taste Profile System
 * Run this script to add optimized indexes for better query performance
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function optimizeDatabaseIndexes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cuppa');
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    // 1. Rating Collection Indexes
    console.log('Creating Rating collection indexes...');
    
    // Compound index for user ratings with timestamp
    await db.collection('ratings').createIndex(
      { userId: 1, createdAt: -1 },
      { 
        name: 'userId_createdAt_compound',
        background: true 
      }
    );
    
    // Index for coffee-based queries
    await db.collection('ratings').createIndex(
      { coffeeId: 1, rating: -1 },
      { 
        name: 'coffeeId_rating_compound',
        background: true 
      }
    );
    
    // Index for taste profile aggregation queries
    await db.collection('ratings').createIndex(
      { userId: 1, rating: -1, createdAt: -1 },
      { 
        name: 'userId_rating_createdAt_compound',
        background: true 
      }
    );

    // 2. Coffee Collection Indexes
    console.log('Creating Coffee collection indexes...');
    
    // Compound index for flavor profile queries
    await db.collection('coffees').createIndex(
      { _id: 1, 'flavorProfile.sweetness': 1, 'flavorProfile.acidity': 1 },
      { 
        name: 'id_flavorProfile_compound',
        background: true 
      }
    );
    
    // Index for origin and processing method queries
    await db.collection('coffees').createIndex(
      { origin: 1, processingMethod: 1, roastLevel: 1 },
      { 
        name: 'origin_processing_roast_compound',
        background: true 
      }
    );
    
    // Text index for coffee search functionality
    await db.collection('coffees').createIndex(
      { name: 'text', origin: 'text', description: 'text' },
      { 
        name: 'coffee_text_search',
        background: true 
      }
    );

    // 3. TasteProfile Collection Indexes
    console.log('Creating TasteProfile collection indexes...');
    
    // Primary index for user taste profiles
    await db.collection('tasteprofiles').createIndex(
      { userId: 1, lastCalculated: -1, profileConfidence: -1 },
      { 
        name: 'userId_lastCalculated_confidence_compound',
        background: true 
      }
    );
    
    // Index for similarity calculations
    await db.collection('tasteprofiles').createIndex(
      { 'attributes.sweetness': 1, 'attributes.acidity': 1, 'attributes.body': 1 },
      { 
        name: 'attributes_similarity_compound',
        background: true 
      }
    );
    
    // Index for profile status and updates
    await db.collection('tasteprofiles').createIndex(
      { lastCalculated: -1, profileConfidence: -1, isActive: 1 },
      { 
        name: 'lastCalculated_confidence_active_compound',
        background: true 
      }
    );

    // 4. User Collection Indexes
    console.log('Creating User collection indexes...');
    
    // Index for user authentication and profile queries
    await db.collection('users').createIndex(
      { email: 1 },
      { 
        name: 'email_unique',
        unique: true,
        background: true 
      }
    );
    
    // Index for user activity tracking
    await db.collection('users').createIndex(
      { lastActive: -1, isActive: 1 },
      { 
        name: 'lastActive_isActive_compound',
        background: true 
      }
    );

    // 5. Performance Optimization Indexes
    console.log('Creating performance optimization indexes...');
    
    // Sparse index for taste profile cache keys
    await db.collection('tasteprofiles').createIndex(
      { cacheKey: 1 },
      { 
        name: 'cacheKey_sparse',
        sparse: true,
        background: true 
      }
    );
    
    // Index for batch processing operations
    await db.collection('ratings').createIndex(
      { batchId: 1, processedAt: -1 },
      { 
        name: 'batchId_processedAt_compound',
        sparse: true,
        background: true 
      }
    );

    console.log('✅ All database indexes created successfully!');
    
    // Display index statistics
    console.log('\n📊 Index Statistics:');
    const collections = ['ratings', 'coffees', 'tasteprofiles', 'users'];
    
    for (const collectionName of collections) {
      const indexes = await db.collection(collectionName).indexes();
      console.log(`\n${collectionName.toUpperCase()} Collection (${indexes.length} indexes):`);
      indexes.forEach(index => {
        console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
      });
    }

    // Performance recommendations
    console.log('\n🚀 Performance Recommendations:');
    console.log('1. Monitor index usage with db.collection.getIndexes()');
    console.log('2. Use explain() to verify query plans are using indexes');
    console.log('3. Consider adding TTL indexes for temporary data');
    console.log('4. Regularly analyze slow query logs');
    console.log('5. Monitor index size and memory usage');

  } catch (error) {
    console.error('❌ Error optimizing database indexes:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the optimization if this script is executed directly
if (require.main === module) {
  optimizeDatabaseIndexes()
    .then(() => {
      console.log('\n✅ Database optimization completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Database optimization failed:', error);
      process.exit(1);
    });
}

module.exports = { optimizeDatabaseIndexes }; 