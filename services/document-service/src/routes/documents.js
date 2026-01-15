const express = require('express');
const router = express.Router();
const DocumentController = require('../controllers/DocumentController');

// Get generic list or by category via query
router.get('/', DocumentController.getDocuments);

// Explicit Category Routes
router.get('/sales', (req, res, next) => { req.params.category = 'sales'; next(); }, DocumentController.getDocuments);
router.get('/inventory', (req, res, next) => { req.params.category = 'inventory'; next(); }, DocumentController.getDocuments);
router.get('/reports', (req, res, next) => { req.params.category = 'report'; next(); }, DocumentController.getDocuments);
router.get('/company', (req, res, next) => { req.params.category = 'company'; next(); }, DocumentController.getDocuments);

// Get specific document
router.get('/:id', DocumentController.getDocumentById);

// Get by Company (Convenience)
router.get('/company/:companyId', DocumentController.getDocuments);

module.exports = router;
