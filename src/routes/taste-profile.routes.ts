import express from 'express';
import * as tasteProfileController from '../controllers/taste-profile.controller';
import { protect } from '../middleware/auth.middleware';

const router = express.Router();

// Core taste profile routes
router.get('/', protect, tasteProfileController.getUserTasteProfile);
router.post('/generate', protect, tasteProfileController.generateTasteProfile);
router.get('/summary', protect, tasteProfileController.getTasteProfileSummary);
router.get('/attributes', protect, tasteProfileController.getTasteProfileAttributes);
router.get('/flavors', protect, tasteProfileController.getTasteProfileFlavors);
router.get('/stats', protect, tasteProfileController.getTasteProfileStats);

// Affinity and similarity routes
router.get('/affinity/user/:targetUserId', protect, tasteProfileController.calculateUserAffinity);
router.get('/affinity/coffee/:coffeeId', protect, tasteProfileController.calculateCoffeeAffinity);
router.get('/similar-users', protect, tasteProfileController.findSimilarUsers);
router.post('/refine', protect, tasteProfileController.refineProfileWithCollaborativeFiltering);

// Admin routes
router.get('/admin/stale', protect, tasteProfileController.getStaleProfiles);
router.post('/admin/batch-update', protect, tasteProfileController.batchUpdateProfiles);
router.post('/admin/cluster', protect, tasteProfileController.clusterUsersByTaste);

// Update-related routes
router.post('/update/:userId', protect, tasteProfileController.triggerUpdate);
router.get('/update/queue-status', protect, tasteProfileController.getQueueStatus);
router.get('/update/config', protect, tasteProfileController.getUpdateConfig);
router.put('/update/config', protect, tasteProfileController.updateConfig);
router.post('/update/process-queue', protect, tasteProfileController.processQueue);
router.get('/update/history/:userId', protect, tasteProfileController.getUpdateHistory);

export default router; 