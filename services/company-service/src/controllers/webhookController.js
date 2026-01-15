// STRIPE DISABLED: All Stripe webhook functionality has been commented out
// This file is preserved for future re-enablement of Stripe integration

/*
const asyncHandler = require("express-async-handler");
const stripeService = require("../services/stripeService");
const Company = require("../models/company.model");
const db = require("../config");

/**
 * Handle account.updated event logic
 *\/
const handleAccountUpdated = async (account) => {
    const accountId = account.id;
    const chargesEnabled = account.charges_enabled;
    const payoutsEnabled = account.payouts_enabled;

    try {
        // Find company by Connect Account ID inside payment_profile JSONB
        const company = await db("companies")
            .whereRaw("payment_profile->'stripe'->>'connectAccountId' = ?", [accountId])
            .first();

        if (!company) {
            console.warn(`[Webhook] No company found for Stripe Account ${accountId}`);
            return;
        }

        // Update payment profile
        const paymentProfile = company.payment_profile || { stripe: {} };
        if (!paymentProfile.stripe) paymentProfile.stripe = {};

        paymentProfile.stripe.chargesEnabled = chargesEnabled;
        paymentProfile.stripe.payoutsEnabled = payoutsEnabled;

        await Company.updateCompany(company.id, {
            payment_profile: paymentProfile,
            updatedAt: new Date(),
        });

        console.log(`[Webhook] Updated company ${company.id} status: Charges=${chargesEnabled}, Payouts=${payoutsEnabled}`);

    } catch (error) {
        console.error(`[Webhook] Failed to update company for account ${accountId}`, error);
        throw error;
    }
};

/**
 * @desc    Handle Stripe Webhooks
 * @route   POST /api/webhooks/stripe/connect
 * @access  Public (Stripe Signature Verified)
 *\/
const handleStripeConnectWebhook = asyncHandler(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        console.error("[Webhook] Missing STRIPE_WEBHOOK_SECRET");
        return res.status(500).send("Server config error");
    }

    try {
        // req.rawBody must be enabled in express config
        event = stripeService.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`[Webhook] Signature Verification Failed: ${err.message}`);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    // Handle the event
    switch (event.type) {
        case 'account.updated': {
            const account = event.data.object;
            await handleAccountUpdated(account);
            break;
        }
        default:
            console.log(`[Webhook] Unhandled event type ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    res.json({ received: true });
});

module.exports = {
    handleStripeConnectWebhook,
};
*/

// Export empty object to prevent import errors
module.exports = {};
