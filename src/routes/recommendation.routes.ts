/**
 * recommendation.routes.ts
 * Routes for recommendation functionality
 */

import express from 'express';
import {
  getRecommendations,
  getUserTasteProfile,
  ingestUserInteractions,
  batchIngestInteractions,
  getUserFeatures,
  refreshUserFeatures,
  getModelMetrics,
  deployModel,
  getABTestResults,
  getSystemHealth,
  getPerformanceMetrics,
  detectModelDrift,
  setModelBaseline,
  getMonitoringStats,
} from '../controllers/recommendation.controller';
import { protect } from '../middleware/auth.middleware';

const router = express.Router();

// All routes are protected - require authentication
router.use(protect);

// Core recommendation endpoints
router.get('/', getRecommendations);
router.get('/profile', getUserTasteProfile);

// Data ingestion endpoints
router.post('/interactions', ingestUserInteractions);
router.post('/interactions/batch', batchIngestInteractions);

// Feature engineering endpoints
router.get('/features/:userId', getUserFeatures);
router.post('/features/:userId/refresh', refreshUserFeatures);

// Model serving endpoints
router.get('/models/metrics', getModelMetrics);
router.post('/models/deploy', deployModel);
router.get('/models/ab-test-results', getABTestResults);
router.post('/models/drift-detection', detectModelDrift);
router.post('/models/set-baseline', setModelBaseline);

// Monitoring and health endpoints
router.get('/health', getSystemHealth);
router.get('/metrics', getPerformanceMetrics);
router.get('/monitoring/stats', getMonitoringStats);

export default router;
