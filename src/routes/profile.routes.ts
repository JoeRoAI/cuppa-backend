import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  updatePassword,
  requestEmailVerification,
  verifyEmail,
  requestPhoneVerification,
  verifyPhone,
  requestAccountDeletion,
  confirmAccountDeletion,
  uploadProfileImage,
  updatePreferences,
  getUserStats,
  getUserBadges,
} from '../controllers/profile.controller';
import { protect, authorize } from '../middleware/auth.middleware';
import multer from 'multer';

const router: Router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Protect all routes
router.use(protect);

// Profile routes
router.get('/', getProfile);
router.put('/', updateProfile);
router.post('/image', upload.single('image'), uploadProfileImage);
router.put('/preferences', updatePreferences);

// Password update
router.put('/password', updatePassword);

// Email verification
router.post('/verify-email/request', requestEmailVerification);
router.post('/verify-email/:token', verifyEmail);

// Phone verification
router.post('/verify-phone/request', requestPhoneVerification);
router.post('/verify-phone/:token', verifyPhone);

// Account deletion
router.delete('/', requestAccountDeletion);
router.delete('/confirm/:token', confirmAccountDeletion);

// User stats and badges
router.get('/stats', getUserStats);
router.get('/badges', getUserBadges);

export default router;
