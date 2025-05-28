import express from 'express';
import {
  getCategories,
  getTags,
  getGuides,
  getGuide,
  getFeaturedGuides,
  getPopularGuides,
  addBookmark,
  removeBookmark,
  getUserBookmarks,
  checkBookmark,
} from '../controllers/education.controller';
import { protect } from '../middleware/auth.middleware';

const router = express.Router();

// Public routes
router.get('/categories', getCategories);
router.get('/tags', getTags);
router.get('/guides', getGuides);
router.get('/guides/featured', getFeaturedGuides);
router.get('/guides/popular', getPopularGuides);
router.get('/guides/:slug', getGuide);

// Protected routes (require authentication)
router.use(protect); // Apply authentication middleware to all routes below

router.post('/bookmarks', addBookmark);
router.get('/bookmarks', getUserBookmarks);
router.get('/bookmarks/check/:guideId', checkBookmark);
router.delete('/bookmarks/:guideId', removeBookmark);

export default router; 