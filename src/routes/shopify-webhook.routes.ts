import express from 'express';
import {
  handleProductWebhook,
  handleInventoryWebhook,
  registerWebhooks,
} from '../controllers/shopify-webhook.controller';
import { protect, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// Public webhook endpoints (authenticated via HMAC verification)
router.post('/products', handleProductWebhook);
router.post('/inventory', handleInventoryWebhook);

// Admin-only route for registering webhooks
router.post('/register', protect, authorize('admin'), registerWebhooks);

export default router; 