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
const { globalErrorHandler, notFoundHandler } = require('./middleware/errorHandler');
const pool = require('./config/db');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for uploaded documents
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/coc-requests', cocRoutes);
app.use('/api/permits', permitRoutes);
app.use('/api/appeals', appealRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/coc', cocRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/inspections', inspectionsRoutes);
app.use('/api/config', configRoutes);
app.use('/api/admin/config', adminConfigRoutes);

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
