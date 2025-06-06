import express from 'express';
import passport from 'passport';
import {
  register,
  login,
  getMe,
  enableMfa,
  disableMfa,
  logout,
  forgotPassword,
  resetPassword,
  refreshToken,
  revokeToken,
  handleSocialAuth,
} from '../controllers/auth.controller';
import { protect, csrfProtection, requireRole } from '../middleware/auth.middleware';

const router = express.Router();

// Register and login routes (public)
router.post('/register', register);
router.post('/login', login);
router.get('/logout', logout);

// Token management routes
router.post('/refresh-token', csrfProtection, refreshToken);
router.post('/revoke-token', protect, csrfProtection, revokeToken);

// Password recovery routes
router.post('/forgotpassword', forgotPassword);
router.post('/resetpassword', resetPassword);

// Protected routes
router.get('/me', protect, getMe);

// MFA routes - require authentication
router.post('/mfa/enable', protect, enableMfa);
router.post('/mfa/disable', protect, disableMfa);

// Admin-only routes
router.get('/users', protect, requireRole('admin'), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Admin access granted',
    user: req.user,
  });
});

// Social login routes

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  handleSocialAuth
);

// Facebook OAuth
router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));
router.get(
  '/facebook/callback',
  passport.authenticate('facebook', { session: false, failureRedirect: '/login' }),
  handleSocialAuth
);

// GitHub OAuth
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));
router.get(
  '/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: '/login' }),
  handleSocialAuth
);

// Apple OAuth (separate implementation required)
// router.get('/apple', ...);
// router.post('/apple/callback', ...);

export default router;
