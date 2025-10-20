// src/Controllers/paymentControllers.js
const paymentService = require('../services/paymentService');

exports.processPayment = async (req, res) => {
    try {
        const { provider, amount, phoneNumber, idempotencyKey } = req.body;
        // Accept idempotency from header if provided
        const headerIdem = req.headers['idempotency-key'] || req.headers['idempotency'];

        if (!provider || !amount || !phoneNumber) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const options = { idempotencyKey: idempotencyKey || headerIdem };

        // Process payment via service
        const result = await paymentService.processPayment(provider, amount, phoneNumber, options);

        // If cached, return 200 with cached flag
        if (result && result.cached) {
            return res.status(200).json({
                message: 'Payment already initiated (cached)',
                provider,
                amount,
                phoneNumber,
                momoResponse: result,
            });
        }

        // Fresh initiation
        return res.status(200).json({
            message: 'New payment successfully initialized',
            provider,
            amount,
            phoneNumber,
            momoResponse: result || null,
        });

    } catch (err) {
        console.error('Payment Error:', err);
        if (!res.headersSent) {
            return res.status(500).json({ error: err.message });
        }
    }
};
