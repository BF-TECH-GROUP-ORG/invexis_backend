const mongoose = require('mongoose');

/**
 * Middleware to pre-generate a MongoDB ObjectId for new resources
 * This allows the ID to be used in upload paths before the document is created
 * 
 * Usage: Add this middleware before upload middleware in routes
 * Example: router.post('/', preGenerateProductId, handleUploads, createProduct);
 */
const preGenerateProductId = (req, res, next) => {
    // Only generate ID for POST requests (creating new products)
    if (req.method === 'POST') {
        // Generate a new MongoDB ObjectId
        const newId = new mongoose.Types.ObjectId();

        // Store it in req.params so it can be used by upload middleware
        req.params.productId = newId.toString();

        // Also store in req.body so the controller can use it when creating the product
        req.body._id = newId;

        console.log(`📝 Pre-generated product ID: ${newId}`);
    }

    next();
};

/**
 * Generic version for other resources (categories, etc.)
 */
const preGenerateId = (paramName, bodyField = '_id') => {
    return (req, res, next) => {
        if (req.method === 'POST') {
            const newId = new mongoose.Types.ObjectId();
            req.params[paramName] = newId.toString();
            req.body[bodyField] = newId;
            console.log(`📝 Pre-generated ${paramName}: ${newId}`);
        }
        next();
    };
};

module.exports = { preGenerateProductId, preGenerateId };
