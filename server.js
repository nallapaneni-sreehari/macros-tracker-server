const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: __dirname + '/.env' });

const { connectDB } = require('./db');
const { logger } = require('./middleware/logger.middleware');
const { errorHandler } = require('./middleware/errorHandler.middleware');
const authRoutes = require('./routes/auth.routes');
const aiRoutes = require('./routes/ai.routes');
const conversationRoutes = require('./routes/conversation.routes');
const feedbackRoutes = require('./routes/feedback.routes');
const storageRoutes = require('./routes/storage.routes');

const app = express();
app.use(cors());
app.use(express.json());
app.use(logger);

// Serve static assets from views/ (logo, images, etc.)
app.use(express.static(path.join(__dirname, 'views')));

// Serve Angular app at /web-app (all static assets under /web-app/*)
app.use('/web-app', express.static(path.join(__dirname, 'www')));

// GET / — serve landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/index.html'));
});

// GET /privacy — serve privacy policy
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/privacy.html'));
});

// GET /feedback — serve feedback page
app.get('/feedback', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/feedback.html'));
});

// GET /web-app/* — catch-all for Angular deep links (client-side routing)
app.get('/web-app/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'www/index.html'));
});

// GET /api/health — simple health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/storage', storageRoutes);

// Centralized error handler — must be last
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});
