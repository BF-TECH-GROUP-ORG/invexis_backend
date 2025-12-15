const { createProduct } = require('../src/controllers/catalogController');
const { createOrder } = require('../src/controllers/orderController');
const { createPromotion } = require('../src/controllers/promotionController');
const { createBanner } = require('../src/controllers/featureBannerController');
const { createReview } = require('../src/controllers/reviewController');
const { addOrUpdateCart } = require('../src/controllers/cartController');
const { addOrUpdateWishlist } = require('../src/controllers/wishlistController');
const { searchProducts } = require('../src/controllers/searchController');
const { getRecommendations } = require('../src/controllers/recommendationController');

// Mock services to prevent actual logic execution
jest.mock('../src/services/catalogService', () => ({ create: jest.fn() }));
jest.mock('../src/services/orderService', () => ({ createOrder: jest.fn() }));
jest.mock('../src/services/promotionService', () => ({ createPromotion: jest.fn() }));
jest.mock('../src/services/bannerService', () => ({ createBanner: jest.fn() }));
jest.mock('../src/services/reviewService', () => ({ createReview: jest.fn() }));
jest.mock('../src/services/cartService', () => ({ addOrUpdateCart: jest.fn() }));
jest.mock('../src/services/wishlistService', () => ({ addOrUpdateWishlist: jest.fn() }));
jest.mock('../src/services/searchService', () => ({ searchProducts: jest.fn() }));
jest.mock('../src/services/recommendationService', () => ({ getTrendingProducts: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ error: jest.fn() }));

// Mock app.js to spy on schemas
jest.mock('../src/utils/app', () => {
    const mockValidate = jest.fn().mockReturnValue({ error: null, value: {} });
    return {
        catalogProductSchema: { validate: mockValidate },
        orderSchema: { validate: mockValidate },
        promotionSchema: { validate: mockValidate },
        bannerSchema: { validate: mockValidate },
        reviewSchema: { validate: mockValidate },
        cartSchema: { validate: mockValidate },
        wishlistSchema: { validate: mockValidate },
        paginationSchema: { validate: mockValidate },
        __mockValidate: mockValidate // Expose for assertions
    };
});


describe('Controller Validation Integration', () => {
    let req, res, next;
    const { __mockValidate } = require('../src/utils/app');

    beforeEach(() => {
        req = { body: {}, query: {}, user: { companyId: '123', userId: '456' } };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        next = jest.fn();
        __mockValidate.mockClear();
    });

    test('catalogController should use catalogProductSchema', async () => {
        await createProduct(req, res);
        expect(__mockValidate).toHaveBeenCalled();
    });

    test('orderController should use orderSchema', async () => {
        await createOrder(req, res);
        expect(__mockValidate).toHaveBeenCalled();
    });

    test('promotionController should use promotionSchema', async () => {
        await createPromotion(req, res);
        expect(__mockValidate).toHaveBeenCalled();
    });

    test('featureBannerController should use bannerSchema', async () => {
        await createBanner(req, res);
        expect(__mockValidate).toHaveBeenCalled();
    });

    test('reviewController should use reviewSchema', async () => {
        await createReview(req, res);
        expect(__mockValidate).toHaveBeenCalled();
    });

    test('cartController should use cartSchema', async () => {
        await addOrUpdateCart(req, res);
        expect(__mockValidate).toHaveBeenCalled();
    });

    test('wishlistController should use wishlistSchema', async () => {
        await addOrUpdateWishlist(req, res);
        expect(__mockValidate).toHaveBeenCalled();
    });

    test('searchController should use paginationSchema', async () => {
        req.query = { companyId: '123', page: 1, limit: 10 };
        await searchProducts(req, res, next);
        expect(__mockValidate).toHaveBeenCalled();
    });

    test('recommendationController should use paginationSchema', async () => {
        req.query = { companyId: '123', limit: 5 };
        await getRecommendations(req, res, next);
        expect(__mockValidate).toHaveBeenCalled();
    });
});
