const express = require('express');
const router = express.Router();
const stocktakeController = require('../controllers/stocktakeController');

// All routes are protected by auth middleware (assumed to be applied in main app)
// For now, these are the base routes for stocktaking

router.post('/start', stocktakeController.startStocktake);

router.get('/list', stocktakeController.listStocktakes);

router.get('/:stocktakeId', stocktakeController.getStocktakeDetails);

router.patch('/line/:lineId', stocktakeController.updateStocktakeLine);

router.post('/:stocktakeId/complete', stocktakeController.completeStocktake);

module.exports = router;
