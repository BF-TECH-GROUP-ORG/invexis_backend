const express = require('express');
const { addFavorite, removeFavorite, getFavorites } = require('../controllers/favoriteController');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.post('/', authMiddleware, addFavorite);
router.delete('/:productId', authMiddleware, removeFavorite);
router.get('/', authMiddleware, getFavorites);

module.exports = router;