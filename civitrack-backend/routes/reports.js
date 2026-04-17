const express = require('express');
const { query } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/roleBasedAccess');
const { validateRequest } = require('../middleware/errorHandler');
const reportsController = require('../controllers/reportsController');

const router = express.Router();

const ALLOWED_REPORT_ROLES = ['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin'];

const validatePeriod = [
  query('periodType')
    .optional()
    .isIn(['month', 'year'])
    .withMessage('periodType must be month or year'),
  query('month')
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage('month must be an integer between 1 and 12')
    .toInt(),
  query('year')
    .optional()
    .isInt({ min: 2000, max: 2100 })
    .withMessage('year must be an integer between 2000 and 2100')
    .toInt(),
  validateRequest,
];

const validateDrilldown = [
  query('metric')
    .isIn(['applications', 'revenue', 'modifications'])
    .withMessage('metric must be applications, revenue, or modifications'),
  query('filterKey').optional().isString().trim(),
  query('filterValue').optional().isString().trim(),
  validateRequest,
];

router.use(authMiddleware, requireRole(ALLOWED_REPORT_ROLES));

router.get('/application-stats', validatePeriod, reportsController.getApplicationStats);
router.get('/revenue', validatePeriod, reportsController.getRevenueSummary);
router.get('/modification-reasons', validatePeriod, reportsController.getModificationReasons);
router.get('/trends', validatePeriod, reportsController.getReportTrends);
router.get('/drilldown', validateDrilldown, reportsController.getReportDrilldown);

module.exports = router;
