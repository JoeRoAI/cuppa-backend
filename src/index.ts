import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import session from 'express-session';
import path from 'path';
import { createServer } from 'http';
import { connectDB, usingMockDatabase } from './config/db';
import config from './config/config';
import configurePassport from './config/passport';
import WebSocketService from './services/websocket.service';

// Import routes
import authRoutes from './routes/auth.routes';
import profileRoutes from './routes/profile.routes';
import coffeeRoutes from './routes/coffee.routes';
import integrationRoutes from './routes/integration.routes';
import shopifyRoutes from './routes/shopify.routes';
import shopifyAuthRoutes from './routes/shopify-auth.routes';
import shopifyWebhookRoutes from './routes/shopify-webhook.routes';
import productSyncRoutes from './routes/product-sync.routes';
import dataCollectionRoutes from './routes/dataCollection.routes';
import recommendationRoutes from './routes/recommendation.routes';
import socialConnectionRoutes from './routes/social-connection.routes';
import checkinRoutes from './routes/checkin.routes';
import ratingRoutes from './routes/rating.routes';
import educationRoutes from './routes/education.routes';
import imageRoutes from './routes/image.routes';
import tasteProfileRoutes from './routes/taste-profile.routes';
import activityFeedRoutes from './routes/activity-feed.routes';
import engagementRoutes from './routes/engagement.routes';
import privacySettingsRoutes from './routes/privacy-settings.routes';
import notificationRoutes from './routes/notification.routes';
// import userRoutes from './routes/user.routes';

// Import initialization functions
import { initializeSync } from './controllers/product-sync.controller';

// Initialize Express app
const app = express();

// Create HTTP server
const httpServer = createServer(app);

// Middleware
app.use(
  cors({
    origin: process.env.NODE_ENV === 'production' 
      ? [
          'https://v0-cuppa-onboarding-design.vercel.app',
          'https://cuppa-frontend.vercel.app',
          'https://cuppa.vercel.app',
          'https://cuppa.app',
          'https://www.cuppa.app',
        ]
      : [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:3002',
          'http://localhost:3003',
          'http://localhost:3004',
          'http://localhost:3005',
        ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Manual CORS middleware as backup
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? [
        'https://v0-cuppa-onboarding-design.vercel.app',
        'https://cuppa-frontend.vercel.app',
        'https://cuppa.vercel.app',
        'https://cuppa.app',
        'https://www.cuppa.app',
      ]
    : [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003',
        'http://localhost:3004',
        'http://localhost:3005',
      ];

  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Configure session for Passport
// Note: For a production app, you'd want to use a more robust session store
app.use(
  session({
    secret: config.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

// Initialize Passport and restore authentication state from session if any
app.use(passport.initialize());
app.use(passport.session());

// Configure Passport strategies
configurePassport();

// Serve static files for uploaded images
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Routes
app.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Cuppa API is running',
    env: config.NODE_ENV,
    version: '1.0.0',
    mockDatabase: usingMockDatabase,
  });
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: config.NODE_ENV,
    port: config.PORT,
    database: usingMockDatabase ? 'mock' : 'mongodb',
  });
});

// CORS test endpoint
app.get('/cors-test', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'CORS is working!',
    origin: req.headers.origin || 'no-origin',
    timestamp: new Date().toISOString(),
    deployTime: 'Force redeploy at 2025-01-28 16:15 UTC',
    headers: req.headers,
  });
});

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/coffee', coffeeRoutes);
app.use('/api/integration', integrationRoutes);
app.use('/api/shopify', shopifyRoutes);
app.use('/api/shopify/auth', shopifyAuthRoutes);
app.use('/api/shopify/webhook', shopifyWebhookRoutes);
app.use('/api/product-sync', productSyncRoutes);
app.use('/api/data', dataCollectionRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/social', socialConnectionRoutes);
app.use('/api', checkinRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/education', educationRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/taste-profile', tasteProfileRoutes);
app.use('/api/activity-feed', activityFeedRoutes);
app.use('/api/engagement', engagementRoutes);
app.use('/api/privacy-settings', privacySettingsRoutes);
app.use('/api/notifications', notificationRoutes);
// app.use('/api/users', userRoutes);

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: err.message || 'An unknown error occurred',
  });
});

// Start the server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    console.log('✅ Database connection established');

    // Initialize product synchronization (non-blocking)
    try {
      await initializeSync();
      console.log('✅ Product sync initialized');
    } catch (error) {
      console.warn('⚠️ Product sync initialization failed (non-critical):', error);
    }

    // Initialize WebSocket service (non-blocking)
    try {
      WebSocketService.initialize(httpServer);
      console.log('✅ WebSocket service initialized');
    } catch (error) {
      console.warn('⚠️ WebSocket service initialization failed (non-critical):', error);
    }

    // Use PORT from environment (Render sets this) or config file
    const port = parseInt(process.env.PORT || config.PORT.toString(), 10);
    
    // For Render, we need to bind to 0.0.0.0 explicitly
    httpServer.listen(port, '0.0.0.0', () => {
      console.log(`🚀 Server running in ${config.NODE_ENV} mode`);
      console.log(`📡 Listening on 0.0.0.0:${port}`);
      console.log(`🔗 Health check: http://0.0.0.0:${port}/health`);
      
      if (config.NODE_ENV === 'production') {
        console.log(`🌐 Production API available at: https://cuppa-backend.onrender.com`);
      } else {
        console.log(`📡 Local API available at: http://localhost:${port}`);
      }
    });
  } catch (err) {
    console.error('❌ Server startup error:', err);
    process.exit(1);
  }
};

startServer().catch((err) => {
  console.error('❌ Critical server startup error:', err);
  process.exit(1);
});

// Export for testing
export default app;
