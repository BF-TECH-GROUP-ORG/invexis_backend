const mongoose = require('mongoose');
const { createCart, removeItem, getCart } = require('./src/services/cartService');
const Cart = require('./src/models/Cart.models');

const uri = 'mongodb://localhost:27017/ecommercedb';

async function run() {
    try {
        await mongoose.connect(uri);
        console.log('Connected to DB');

        const userId = 'test-user-' + Date.now();
        const productId = new mongoose.Types.ObjectId();

        // Create cart with one item
        console.log(`Creating cart for user ${userId} with product ${productId}`);
        await createCart({
            userId,
            items: [{
                productId: productId,
                quantity: 1,
                priceAtAdd: 100,
                currency: 'USD'
            }]
        });

        // Verify creation
        let cart = await getCart(userId);
        console.log('Cart created with items:', cart.items.length);
        if (cart.items.length !== 1) {
            console.error('❌ Failed to create cart with item');
            return;
        }

        // Remove item using string ID (simulating controller input)
        const productIdStr = productId.toString();
        console.log(`Removing product ${productIdStr} (string) from cart`);

        await removeItem(userId, productIdStr);

        // Verify removal
        cart = await getCart(userId);
        console.log('Cart items after removal:', cart.items.length);

        if (cart.items.length === 0) {
            console.log('✅ SUCCESS: Item removed successfully');
        } else {
            console.log('❌ FAILED: Item was NOT removed');
            console.log('Remaining items:', JSON.stringify(cart.items, null, 2));
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
