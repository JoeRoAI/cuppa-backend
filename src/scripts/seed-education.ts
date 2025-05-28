import { connectDB } from '../config/db';
import { seedEducationData } from '../utils/education-seeder';
import { IUser } from '../models/user.model';
import mongoose from 'mongoose';

// Mock user ID for seeding (in a real app, this would be an actual admin user)
const MOCK_AUTHOR_ID = '507f1f77bcf86cd799439011';

const seedAndTest = async () => {
  try {
    console.log('🌱 Starting education data seeding...');
    
    // Connect to database
    await connectDB();
    
    // Seed the education data
    const result = await seedEducationData(MOCK_AUTHOR_ID);
    
    console.log('\n✅ Education data seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Categories: ${result.categories.length}`);
    console.log(`   Tags: ${result.tags.length}`);
    console.log(`   Guides: ${result.guides.length}`);
    
    console.log('\n🔗 Available API Endpoints:');
    console.log('   GET /api/education/categories');
    console.log('   GET /api/education/tags');
    console.log('   GET /api/education/guides');
    console.log('   GET /api/education/guides/featured');
    console.log('   GET /api/education/guides/popular');
    console.log('   GET /api/education/guides/:slug');
    console.log('   POST /api/education/bookmarks (requires auth)');
    console.log('   GET /api/education/bookmarks (requires auth)');
    console.log('   DELETE /api/education/bookmarks/:guideId (requires auth)');
    
    console.log('\n🧪 Test the endpoints:');
    console.log('   curl http://localhost:5001/api/education/categories');
    console.log('   curl http://localhost:5001/api/education/guides');
    console.log('   curl http://localhost:5001/api/education/guides/perfect-pour-over-coffee-guide');
    
    // Close database connection
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed.');
    
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  }
};

// Run the seeding script
if (require.main === module) {
  seedAndTest();
}

export { seedAndTest }; 