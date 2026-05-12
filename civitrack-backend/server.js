/**
 * Express application entrypoint: middleware order matters (body parsers before routes;
 * 404 then global error handler last).
 *
 * Public / ops surfaces:
 * - `ENABLE_PUBLIC_UPLOADS`: when true, `/uploads` is world-readable — keep false outside trusted local debugging.
 * - `COC_DEPRECATION_SUNSET` (optional): advertised sunset for legacy `/api/coc` mount.
 */
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const notificationRoutes = require('./routes/notifications');
const applicationRoutes = require('./routes/applications');
const documentRoutes = require('./routes/documents');
const cocRoutes = require('./routes/coc');
const permitRoutes = require('./routes/permits');
const appealRoutes = require('./routes/appeals');
const feedbackRoutes = require('./routes/feedback');
const reportsRoutes = require('./routes/reports');
const staffRoutes = require('./routes/staff');
const inspectionsRoutes = require('./routes/inspections');
const adminConfigRoutes = require('./routes/adminConfig');
const configRoutes = require('./routes/config');
const simpleDashboardRoutes = require('./routes/simpleDashboard');
const authMiddleware = require('./middleware/auth');
const documentController = require('./controllers/documentController');
const { globalErrorHandler, notFoundHandler } = require('./middleware/errorHandler');
const pool = require('./config/db');

const app = express();
const COC_DEPRECATION_SUNSET = process.env.COC_DEPRECATION_SUNSET || 'Wed, 31 Dec 2026 23:59:59 GMT';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Uploaded files are always served through authenticated access checks.
app.get('/uploads/*', authMiddleware, documentController.getProtectedUpload);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/coc-requests', cocRoutes);
app.use('/api/coc', (req, res, next) => {
  // Keep backward compatibility while steering clients to canonical COC route prefix.
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', COC_DEPRECATION_SUNSET);
  res.setHeader('Warning', '299 - "/api/coc is deprecated and will be removed; use /api/coc-requests"');
  res.setHeader('Link', '</api/coc-requests>; rel="successor-version"');
  next();
}, cocRoutes);
app.use('/api/permits', permitRoutes);
app.use('/api/appeals', appealRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/inspections', inspectionsRoutes);
app.use('/api/config', configRoutes);
app.use('/api/admin/config', adminConfigRoutes);
// Simplified workflow API (narrower status graph); see `utils/applicationValidation.js` workflow: 'simple'.
app.use('/api/simple', simpleDashboardRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend is running' });
});

// Test DB connection
app.get('/api/db-test', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ message: 'Database connected', time: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// 404 handler
app.use(notFoundHandler);

// Global error handling middleware
app.use(globalErrorHandler);

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✓ Server running on http://localhost:${PORT}`);
    console.log(`✓ Database: ${process.env.DATABASE_URL}`);
  });
}

module.exports = app;
