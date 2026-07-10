const { Router } = require('express');
const storageController = require('../controllers/storage.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = Router();

// All storage routes require authentication
router.use(requireAuth);

// Order matters: /:userId/:key must come before /:userId
router.get('/:userId/:key', storageController.getValue);
router.put('/:userId/:key', storageController.setValue);
router.delete('/:userId/:key', storageController.deleteValue);
router.get('/:userId', storageController.listKeys);

module.exports = router;
