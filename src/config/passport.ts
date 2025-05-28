import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as GitHubStrategy } from 'passport-github2';
import User from '../models/user.model';
import { usingMockDatabase } from './db';
import config from './config';
import { mockUsers } from '../controllers/auth.controller';

// Helper function to find or create user based on OAuth profile
const findOrCreateUser = async (provider: string, profile: any, done: any) => {
  try {
    // Handle mock database for development/testing
    if (usingMockDatabase) {
      // Try to find a user with this provider ID
      const existingUser = mockUsers.find(
        (user) =>
          user.socialAuth &&
          user.socialAuth[provider] &&
          user.socialAuth[provider].id === profile.id
      );

      if (existingUser) {
        // User exists, return it
        return done(null, existingUser);
      }

      // User does not exist, create a new one
      const email =
        profile.emails && profile.emails.length > 0
          ? profile.emails[0].value
          : `${profile.id}@${provider}.user`;

      // Check if user already exists with this email
      const userWithEmail = mockUsers.find((user) => user.email === email);

      if (userWithEmail) {
        // User exists with this email, link the accounts
        userWithEmail.socialAuth = {
          ...(userWithEmail.socialAuth || {}),
          [provider]: {
            id: profile.id,
            token: 'mock-token',
            name: profile.displayName,
            email,
          },
        };
        return done(null, userWithEmail);
      }

      // Create a new user
      const newUser = {
        _id: `mock-${mockUsers.length + 1}`,
        name: profile.displayName,
        email,
        password: '*****', // Password not used for social auth
        role: 'user',
        mfaEnabled: false,
        knownDevices: [],
        knownIPs: [],
        loginAttempts: 0,
        refreshTokens: [],
        preferences: {
          roastLevel: [],
          flavorProfile: [],
          brewMethods: [],
        },
        savedCoffees: [],
        ratingsHistory: [],
        socialAuth: {
          [provider]: {
            id: profile.id,
            token: 'mock-token',
            name: profile.displayName,
            email,
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUsers.push(newUser);
      return done(null, newUser);
    }

    // For real MongoDB database
    // Check if user already exists
    let user = await User.findOne({
      [`socialAuth.${provider}.id`]: profile.id,
    });

    if (user) {
      // User exists, return it
      return done(null, user);
    }

    // Get primary email from profile
    const email =
      profile.emails && profile.emails.length > 0
        ? profile.emails[0].value
        : `${profile.id}@${provider}.user`;

    // Check if user already exists with this email
    user = await User.findOne({ email });

    if (user) {
      // User exists with this email, link the accounts
      user.socialAuth = {
        ...(user.socialAuth || {}),
        [provider]: {
          id: profile.id,
          token: 'temp-token', // In production we'd handle token storage more securely
          name: profile.displayName,
          email,
        },
      };

      await user.save();
      return done(null, user);
    }

    // Create a new user
    const newUser = await User.create({
      name: profile.displayName,
      email,
      password: Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8), // Random password
      role: 'user',
      socialAuth: {
        [provider]: {
          id: profile.id,
          token: 'temp-token', // In production we'd handle token storage more securely
          name: profile.displayName,
          email,
        },
      },
    });

    return done(null, newUser);
  } catch (error) {
    return done(error, false);
  }
};

export default () => {
  // Serialize user to session
  passport.serializeUser((user: any, done) => {
    done(null, user.id || user._id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id: string, done) => {
    try {
      if (usingMockDatabase) {
        const user = mockUsers.find((u) => u._id === id);
        return done(null, user || false);
      }

      const user = await User.findById(id);
      done(null, user || false);
    } catch (error) {
      done(error, false);
    }
  });

  // Configure Google Strategy
  if (config.OAUTH_PROVIDERS?.GOOGLE_CLIENT_ID && config.OAUTH_PROVIDERS?.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: config.OAUTH_PROVIDERS.GOOGLE_CLIENT_ID,
          clientSecret: config.OAUTH_PROVIDERS.GOOGLE_CLIENT_SECRET,
          callbackURL: '/api/auth/google/callback',
          scope: ['profile', 'email'],
        },
        (_accessToken, _refreshToken, profile, done) => {
          findOrCreateUser('google', profile, done);
        }
      )
    );
  }

  // Configure Facebook Strategy
  if (config.OAUTH_PROVIDERS?.FACEBOOK_APP_ID && config.OAUTH_PROVIDERS?.FACEBOOK_APP_SECRET) {
    passport.use(
      new FacebookStrategy(
        {
          clientID: config.OAUTH_PROVIDERS.FACEBOOK_APP_ID,
          clientSecret: config.OAUTH_PROVIDERS.FACEBOOK_APP_SECRET,
          callbackURL: '/api/auth/facebook/callback',
          profileFields: ['id', 'displayName', 'photos', 'email'],
        },
        (_accessToken, _refreshToken, profile, done) => {
          findOrCreateUser('facebook', profile, done);
        }
      )
    );
  }

  // Configure GitHub Strategy
  if (config.OAUTH_PROVIDERS?.GITHUB_CLIENT_ID && config.OAUTH_PROVIDERS?.GITHUB_CLIENT_SECRET) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: config.OAUTH_PROVIDERS.GITHUB_CLIENT_ID,
          clientSecret: config.OAUTH_PROVIDERS.GITHUB_CLIENT_SECRET,
          callbackURL: '/api/auth/github/callback',
          scope: ['user:email'],
        },
        (_accessToken, _refreshToken, profile, done) => {
          findOrCreateUser('github', profile, done);
        }
      )
    );
  }

  // Add more strategies here as needed (e.g., Apple, Twitter, etc.)
};
