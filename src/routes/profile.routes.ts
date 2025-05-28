import express from 'express';
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
} from '../controllers/profile.controller';
import { protect, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// Protect all routes
router.use(protect);

// Profile routes
router.get('/', getProfile);
router.put('/', updateProfile);

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

export default router;
