import express from 'express';
import {
  startOAuth,
  handleOAuthCallback,
  generateMultipassToken,
  getConnectionStatus,
  setAccessToken,
} from '../controllers/shopify-auth.controller';
import { protect, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// Get Shopify connection status
router.get('/status', protect, authorize('admin'), getConnectionStatus);

// OAuth flow
router.get('/oauth', protect, authorize('admin'), startOAuth);
router.get('/callback', handleOAuthCallback);

// Multipass authentication for customer SSO
router.post('/multipass', protect, generateMultipassToken);

// Manually set access token (admin only)
router.post('/token', protect, authorize('admin'), setAccessToken);

export default router; 