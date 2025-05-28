import mongoose from 'mongoose';
import config from './config';

// MongoDB connection options
const options = {
  autoIndex: true, // Build indexes
  maxPoolSize: 10, // Maintain up to 10 socket connections
  serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
  family: 4, // Use IPv4, skip trying IPv6
};

// Flag to track if we're using mock data mode
export let usingMockDatabase = false;

// Setup mock database functionality
export const setupMockDatabase = () => {
  usingMockDatabase = true;
  console.log(
    '🧪 Using mock database mode. Some database-dependent features will use in-memory data.'
  );

  // Here we could set up any mock data or in-memory stores needed for development
  // This would be implemented as the project progresses
};

// MongoDB connection function
export const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = config.MONGODB_URI;

    // Check if the connection string is the default local one and we can't connect
    if (mongoURI === 'mongodb://localhost:27017/cuppa' && config.NODE_ENV === 'development') {
      try {
        // Try to connect with a short timeout
        const localOptions = {
          ...options,
          serverSelectionTimeoutMS: 2000, // Use a shorter timeout for local connection test
        };
        await mongoose.connect(mongoURI, localOptions);
      } catch (err) {
        // If local connection fails, suggest using mock mode or Atlas
        console.warn('⚠️ Could not connect to local MongoDB. You have three options:');
        console.warn('1. Start a local MongoDB instance');
        console.warn('2. Update .env with a MongoDB Atlas connection string');
        console.warn('3. Continue in mock database mode (limited functionality)');

        // Set up mock database automatically in development
        setupMockDatabase();
        return;
      }
    } else {
      // Regular connection attempt with normal timeout
      const conn = await mongoose.connect(mongoURI, options);
      console.log(`MongoDB Connected: ${conn.connection.host}`);
    }

    // Handle connection errors after initial connection
    mongoose.connection.on('error', (err) => {
      console.error(`MongoDB connection error: ${err}`);
    });

    // Handle disconnection
    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected, trying to reconnect...');
    });

    // Handle reconnection
    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });

    // If the Node process ends, close the MongoDB connection
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed due to app termination');
      process.exit(0);
    });
  } catch (error: any) {
    console.error(`MongoDB connection error: ${error.message}`);

    // In development mode, continue without exiting to allow working on other features
    if (config.NODE_ENV === 'development') {
      console.log(
        'Running in development mode without MongoDB connection. Some features will be unavailable.'
      );
      // Set up mock database automatically
      setupMockDatabase();
      return;
    } else {
      // Only exit in production environment
      process.exit(1);
    }
  }
};

export default connectDB;
