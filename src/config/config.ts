import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface OAuthProviders {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  FACEBOOK_APP_ID?: string;
  FACEBOOK_APP_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
}

interface Config {
  NODE_ENV: string;
  PORT: number;
  MONGODB_URI: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_COOKIE_EXPIRE: number;
  JWT_REFRESH_EXPIRE: number;
  SHOPIFY_API_KEY?: string;
  SHOPIFY_API_SECRET?: string;
  SHOPIFY_STORE_URL?: string;
  OAUTH_PROVIDERS?: OAuthProviders;
  API_HOST: string;
}

// Default configuration values
const defaultConfig: Config = {
  NODE_ENV: 'development',
  PORT: 5001,
  MONGODB_URI: 'mongodb://localhost:27017/cuppa',
  JWT_SECRET: 'your_jwt_secret_here',
  JWT_EXPIRES_IN: '15m',
  JWT_COOKIE_EXPIRE: 30,
  JWT_REFRESH_EXPIRE: 30,
  OAUTH_PROVIDERS: {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
    FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    APPLE_CLIENT_ID: process.env.APPLE_CLIENT_ID,
    APPLE_TEAM_ID: process.env.APPLE_TEAM_ID,
    APPLE_KEY_ID: process.env.APPLE_KEY_ID,
    APPLE_PRIVATE_KEY: process.env.APPLE_PRIVATE_KEY,
  },
  API_HOST: 'localhost:5001',
};

// Load values from environment variables
const config: Config = {
  NODE_ENV: process.env.NODE_ENV || defaultConfig.NODE_ENV,
  // For Render, use PORT from environment or default to 10000
  PORT: parseInt(process.env.PORT || (process.env.NODE_ENV === 'production' ? '10000' : defaultConfig.PORT.toString()), 10),
  MONGODB_URI: process.env.MONGODB_URI || defaultConfig.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET || defaultConfig.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || defaultConfig.JWT_EXPIRES_IN,
  JWT_COOKIE_EXPIRE: parseInt(
    process.env.JWT_COOKIE_EXPIRE || defaultConfig.JWT_COOKIE_EXPIRE.toString(),
    10
  ),
  JWT_REFRESH_EXPIRE: parseInt(
    process.env.JWT_REFRESH_EXPIRE || defaultConfig.JWT_REFRESH_EXPIRE.toString(),
    10
  ),
  SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET,
  SHOPIFY_STORE_URL: process.env.SHOPIFY_STORE_URL,
  OAUTH_PROVIDERS: defaultConfig.OAUTH_PROVIDERS,
  API_HOST: process.env.API_HOST || defaultConfig.API_HOST,
};

// Print a warning if using default JWT secret in production
if (config.NODE_ENV === 'production' && config.JWT_SECRET === defaultConfig.JWT_SECRET) {
  console.warn(
    'WARNING: Using default JWT_SECRET in production environment. ' +
      'Set a secure JWT_SECRET in your environment variables.'
  );
}

// Print configuration info for debugging
console.log(`🔧 Configuration loaded:`);
console.log(`   NODE_ENV: ${config.NODE_ENV}`);
console.log(`   PORT: ${config.PORT}`);
console.log(`   MONGODB_URI: ${config.MONGODB_URI.replace(/\/\/.*@/, '//***:***@')}`); // Hide credentials
console.log(`   API_HOST: ${config.API_HOST}`);

// Debug environment variables in production
if (config.NODE_ENV === 'production') {
  console.log(`🔍 Environment variables debug:`);
  console.log(`   process.env.NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`   process.env.PORT: ${process.env.PORT}`);
  console.log(`   process.env.MONGODB_URI exists: ${!!process.env.MONGODB_URI}`);
  console.log(`   process.env.JWT_SECRET exists: ${!!process.env.JWT_SECRET}`);
  console.log(`   process.env.API_HOST exists: ${!!process.env.API_HOST}`);
}

export default config;
