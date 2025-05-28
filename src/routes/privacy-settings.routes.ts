import { Router } from 'express';
import privacySettingsController from '../controllers/privacy-settings.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

// Apply authentication middleware to all routes
router.use(protect);

// Get current user's privacy settings
router.get('/', privacySettingsController.getPrivacySettings);

// Update current user's privacy settings
router.put('/', privacySettingsController.updatePrivacySettings);

// Reset privacy settings to defaults
router.post('/reset', privacySettingsController.resetPrivacySettings);

// Check profile visibility for a specific user
router.get('/check/profile/:targetUserId', privacySettingsController.checkProfileVisibility);

// Check activity visibility for a specific user
router.get('/check/activities/:targetUserId', privacySettingsController.checkActivityVisibility);

// Get filtered user data based on privacy settings
router.get('/filtered/:targetUserId', privacySettingsController.getFilteredUserData);

// Admin-only routes
router.get('/user/:userId', privacySettingsController.getUserPrivacySettings);

export default router; 