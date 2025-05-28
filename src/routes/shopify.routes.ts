import express from 'express';
import {
  getProducts,
  getProductById,
  getProductByHandle,
  createCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  getCart,
  createCheckout,
  getOrders,
  getOrderById,
  getShopifyStatus,
} from '../controllers/shopify.controller';
import { protect } from '../middleware/auth.middleware';

const router = express.Router();

// Public routes for checking Shopify availability
router.get('/status', getShopifyStatus);

// Public routes for browsing products
router.get('/products', getProducts);
router.get('/products/handle/:handle', getProductByHandle);
router.get('/products/:id', getProductById);

// Protected routes requiring authentication
router.use('/cart', protect);
router.use('/checkout', protect);
router.use('/orders', protect);

// Cart management
router.post('/cart', createCart);
router.post('/cart/items', addToCart);
router.put('/cart/items/:lineId', updateCartItem);
router.delete('/cart/items/:lineId', removeFromCart);
router.get('/cart/:id', getCart);

// Checkout process
router.post('/checkout', createCheckout);

// Order management
router.get('/orders', getOrders);
router.get('/orders/:id', getOrderById);

export default router;
