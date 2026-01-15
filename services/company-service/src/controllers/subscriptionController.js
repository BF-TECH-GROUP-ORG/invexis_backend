const asyncHandler = require("express-async-handler");
const Subscription = require("../models/subscription.model");
const Company = require("../models/company.model");
const { subscriptionEvents } = require("../events/eventHelpers");
const SubscriptionFeaturesService = require("../services/subscriptionFeatures.service");
const db = require("../config");

/**
 * @desc    Create a new subscription
 * @route   POST /api/subscriptions
 * @access  Private (Company Admin or Super Admin)
 */
const createSubscription = asyncHandler(async (req, res) => {
  const {
    company_id,
    tier,
    amount,
    currency,
    payment_reference,
    start_date,
    end_date,
  } = req.body;

  // Validate required fields
  if (!company_id || !tier) {
    res.status(400);
    throw new Error("Company ID and tier are required");
  }

  // Check if company exists
  const company = await Company.findCompanyById(company_id);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  // Check if subscription already exists
  const existing = await Subscription.findByCompany(company_id);
  if (existing) {
    res.status(400);
    throw new Error(
      "Subscription already exists for this company. Use update or renew instead."
    );
  }

  // Create subscription with transaction (atomic with outbox event)
  const subscription = await db.transaction(async (trx) => {
    const newSubscription = await Subscription.create(
      {
        company_id,
        tier,
        amount,
        currency,
        payment_reference,
        start_date,
        end_date,
      },
      trx
    );

    // Create outbox event within transaction (will be published by dispatcher)
    await subscriptionEvents.created(newSubscription, trx);

    return newSubscription;
  });

  res.status(201).json({
    success: true,
    data: subscription,
  });
});

/**
 * @desc    Get subscription by company
 * @route   GET /api/subscriptions/company/:companyId
 * @access  Private
 */
const getSubscriptionByCompany = asyncHandler(async (req, res) => {
  const { companyId } = req.params;

  const subscription = await Subscription.findByCompany(companyId);

  if (!subscription) {
    res.status(404);
    throw new Error("Subscription not found for this company");
  }

  res.json({
    success: true,
    data: subscription,
  });
});

/**
 * @desc    Update subscription
 * @route   PUT /api/subscriptions/company/:companyId
 * @access  Private (Company Admin or Super Admin)
 */
const updateSubscription = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { tier, amount, currency, payment_reference, is_active } = req.body;

  const subscription = await Subscription.findByCompany(companyId);
  if (!subscription) {
    res.status(404);
    throw new Error("Subscription not found");
  }

  const updateData = {
    ...(tier && { tier }),
    ...(amount !== undefined && { amount }),
    ...(currency && { currency }),
    ...(payment_reference && { payment_reference }),
    ...(is_active !== undefined && { is_active }),
  };

  // Update subscription with transaction (atomic with outbox event)
  const updated = await db.transaction(async (trx) => {
    const result = await Subscription.update(companyId, updateData, trx);

    // Create outbox event within transaction (will be published by dispatcher)
    await subscriptionEvents.updated(result, trx);

    return result;
  });

  res.json({
    success: true,
    data: updated,
  });
});

/**
 * @desc    Renew subscription
 * @route   POST /api/subscriptions/company/:companyId/renew
 * @access  Private (Company Admin or Super Admin)
 */
const renewSubscription = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { tier, amount, durationDays, paymentMethod } = req.body;

  if (!tier || !amount || !durationDays) {
    res.status(400);
    throw new Error("Tier, amount, and duration (in days) are required");
  }

  const subscription = await Subscription.findByCompany(companyId);
  if (!subscription) {
    res.status(404);
    throw new Error("Subscription not found");
  }

  // Renew subscription with transaction (atomic with outbox event)
  const renewed = await db.transaction(async (trx) => {
    const result = await Subscription.renew(
      companyId,
      tier,
      amount,
      durationDays,
      trx
    );

    // Create outbox event within transaction (will be published by dispatcher)
    await subscriptionEvents.renewed(result, trx);

    // Trigger Payment Request
    // Note: In a real flow we might want to wait for payment BEFORE renewing, 
    // but here we follow the "initiate and process" pattern.
    const { emit } = require("../events/producer");
    // We emit this outside the transaction or as an outbox event? 
    // For simplicity, we'll try to emit it directly here, but ideally it should be an outbox item.
    // However, since `subscriptionEvents` are robust, let's treat payment request as a side effect.
    // We will emit it AFTER the transaction commits to ensure we don't charge if DB fails.

    return result;
  });

  // Emit Payment Request asynchronously after successful DB commit
  try {
    const { emit } = require("../events/producer");
    const company = await Company.findCompanyById(companyId);

    // Determine Gateway based on payment method
    let gateway = 'mtn_momo'; // Default
    let schemaPaymentMethod = 'mobile_money'; // Default
    const normalizedMethod = (paymentMethod || 'mtn').toLowerCase();

    if (normalizedMethod === 'bank_transfer' || normalizedMethod === 'card') {
      gateway = 'manual';
      schemaPaymentMethod = normalizedMethod;
    } else if (normalizedMethod === 'mtn' || normalizedMethod === 'mobile') {
      gateway = 'mtn_momo';
      schemaPaymentMethod = 'mobile_money';
    } else if (normalizedMethod === 'airtel') {
      gateway = 'airtel_money';
      schemaPaymentMethod = 'mobile_money';
    } else {
      gateway = 'manual';
      schemaPaymentMethod = 'manual';
    }

    // Helper to extract phone from payment_phones
    const getPaymentPhone = (comp, providerKeys) => {
      if (!comp?.payment_phones) return null;
      // Parse if string
      let phones = comp.payment_phones;
      if (typeof phones === 'string') {
        try { phones = JSON.parse(phones); } catch (e) { phones = []; }
      }
      if (!Array.isArray(phones)) return null;

      // Find matching provider
      const match = phones.find(p =>
        providerKeys.includes(p.provider?.toUpperCase()) && p.enabled !== false
      );
      return match ? match.phoneNumber : null;
    };

    // Helper to get Stripe Payment Method ID
    const getStripePaymentMethod = (sub, comp) => {
      // 1. Check subscription specific method
      if (sub.stripe_payment_method_id) return sub.stripe_payment_method_id;

      // 2. Check company payment profile
      if (comp?.payment_profile) {
        let profile = comp.payment_profile;
        if (typeof profile === 'string') {
          try { profile = JSON.parse(profile); } catch (e) { profile = {}; }
        }
        if (profile.stripe && profile.stripe.paymentMethodId) {
          return profile.stripe.paymentMethodId;
        }
      }
      return null; // No saved method found
    };

    let targetPhone = subscription.momo_phone_number;
    let paymentMethodId = null;

    if (gateway === 'stripe') {
      paymentMethodId = getStripePaymentMethod(subscription, company);
      if (!paymentMethodId) {
        console.warn(`⚠️ No Stripe payment method found for company ${companyId}`);
        // Depending on logic, we might want to continue to let user enter card on checkout, 
        // but if this is a backend-initiated charge it might fail without a method.
        // For now, we proceed, payment service might handle "new card" flow or error.
      }
    } else {
      // Phone logic for mobile money
      if (!targetPhone) {
        if (gateway === 'mtn_momo') targetPhone = getPaymentPhone(company, ['MTN', 'MTN_MOMO']);
        else if (gateway === 'airtel_money') targetPhone = getPaymentPhone(company, ['AIRTEL', 'AIRTEL_MONEY']);
        else if (gateway === 'mpesa') targetPhone = getPaymentPhone(company, ['MPESA']);
      }
      // Fallback to main company phone
      if (!targetPhone) targetPhone = company?.phone;
    }

    const payload = {
      event: 'PAYMENT_REQUESTED',
      source: 'company-service',
      paymentType: 'SUBSCRIPTION',
      referenceId: `SUB-${companyId}-${Date.now()}`,
      companyId: companyId,
      // Use system UUID or fixed string if no user, but schema expects UUID. 
      // For now 'system' is accepted by payment-service, but we should be consistent.
      sellerId: req.user ? req.user.userId : 'system',
      amount: amount,
      currency: 'RWF',
      description: `${tier.toUpperCase()} Tier Subscription - ${durationDays} days`,
      paymentMethod: schemaPaymentMethod,
      gateway: gateway,
      phoneNumber: targetPhone, // Will be null/undefined for Stripe, which is fine
      customer: {
        name: company?.name || 'Company Admin', // Fixed: company.name not company_name
        email: company?.email || 'admin@company.com',
        phone: targetPhone || company?.phone
      },
      lineItems: [{
        id: `tier_${tier}`,
        name: `${tier.toUpperCase()} Tier Subscription`,
        qty: 1,
        price: amount
      }],
      idempotencyKey: `pay_sub_${companyId}_${Date.now()}`,
      metadata: {
        subscriptionId: renewed.id,
        companyId: companyId,
        tier: tier,
        durationDays: durationDays,
        initiatedBy: req.user ? req.user.userId : 'system',
        stripePaymentMethodId: paymentMethodId // Pass this to payment service
      }
    };

    await emit('subscription.payment.requested', payload);
    console.log(`📤 Triggered payment request for subscription renewal: ${companyId}`);
  } catch (e) {
    console.error("Failed to emit subscription payment event", e);
  }

  res.json({
    success: true,
    data: renewed,
  });
});

/**
 * @desc    Deactivate subscription
 * @route   PATCH /api/subscriptions/company/:companyId/deactivate
 * @access  Private (Super Admin)
 */
const deactivateSubscription = asyncHandler(async (req, res) => {
  const { companyId } = req.params;

  const subscription = await Subscription.findByCompany(companyId);
  if (!subscription) {
    res.status(404);
    throw new Error("Subscription not found");
  }

  // Deactivate subscription with transaction (atomic with outbox event)
  const deactivated = await db.transaction(async (trx) => {
    const result = await Subscription.deactivate(companyId, trx);

    // Create outbox event within transaction (will be published by dispatcher)
    await subscriptionEvents.deactivated(result, trx);

    return result;
  });

  res.json({
    success: true,
    data: deactivated,
  });
});

/**
 * @desc    Check subscription status
 * @route   GET /api/subscriptions/company/:companyId/status
 * @access  Private
 */
const checkSubscriptionStatus = asyncHandler(async (req, res) => {
  const { companyId } = req.params;

  const subscription = await Subscription.findByCompany(companyId);

  if (!subscription) {
    res.status(404);
    throw new Error("Subscription not found");
  }

  const now = new Date();
  const endDate = new Date(subscription.end_date);
  const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

  const status = {
    is_active: subscription.is_active,
    company_status: company.status,
    tier: subscription.tier,
    end_date: subscription.end_date,
    days_remaining: daysRemaining,
    is_expired: daysRemaining < 0,
    is_expiring_soon: daysRemaining > 0 && daysRemaining <= 7,
  };

  // Create outbox event if subscription is expiring soon (with transaction)
  if (status.is_expiring_soon && subscription.is_active) {
    await db.transaction(async (trx) => {
      await subscriptionEvents.expiring(subscription, trx);
    });
  }

  res.json({
    success: true,
    data: status,
  });
});

/**
 * @desc    Get subscription features for a company
 * @route   GET /api/subscriptions/company/:companyId/features
 * @access  Private
 */
const getSubscriptionFeatures = asyncHandler(async (req, res) => {
  const { companyId } = req.params;

  const company = await Company.findCompanyById(companyId);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  const features = await SubscriptionFeaturesService.getCompanyFeatures(
    companyId
  );

  res.json({
    success: true,
    data: features,
  });
});

/**
 * @desc    Check if company has access to a feature
 * @route   POST /api/subscriptions/company/:companyId/check-feature
 * @access  Private
 */
const checkFeatureAccess = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { featureCategory, featureName } = req.body;

  if (!featureCategory || !featureName) {
    res.status(400);
    throw new Error("Feature category and name are required");
  }

  const company = await Company.findCompanyById(companyId);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  const hasAccess = await SubscriptionFeaturesService.hasFeatureAccess(
    companyId,
    featureCategory,
    featureName
  );

  res.json({
    success: true,
    data: {
      companyId,
      featureCategory,
      featureName,
      hasAccess,
    },
  });
});

/**
 * @desc    Get enabled features for a company
 * @route   GET /api/subscriptions/company/:companyId/enabled-features
 * @access  Private
 */
const getEnabledFeatures = asyncHandler(async (req, res) => {
  const { companyId } = req.params;

  const company = await Company.findCompanyById(companyId);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  const enabledFeatures = await SubscriptionFeaturesService.getEnabledFeatures(
    companyId
  );

  res.json({
    success: true,
    data: enabledFeatures,
  });
});

/**
 * @desc    Get disabled features for a company
 * @route   GET /api/subscriptions/company/:companyId/disabled-features
 * @access  Private
 */
const getDisabledFeatures = asyncHandler(async (req, res) => {
  const { companyId } = req.params;

  const company = await Company.findCompanyById(companyId);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  const disabledFeatures =
    await SubscriptionFeaturesService.getDisabledFeatures(companyId);

  res.json({
    success: true,
    data: disabledFeatures,
  });
});

/**
 * @desc    Get upgrade suggestions for a company
 * @route   GET /api/subscriptions/company/:companyId/upgrade-suggestions
 * @access  Private
 */
const getUpgradeSuggestions = asyncHandler(async (req, res) => {
  const { companyId } = req.params;

  const company = await Company.findCompanyById(companyId);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  const suggestions = await SubscriptionFeaturesService.getUpgradeSuggestions(
    companyId
  );

  res.json({
    success: true,
    data: suggestions,
  });
});

/**
 * @desc    Get subscription summary for a company
 * @route   GET /api/subscriptions/company/:companyId/summary
 * @access  Private
 */
const getSubscriptionSummary = asyncHandler(async (req, res) => {
  const { companyId } = req.params;

  const company = await Company.findCompanyById(companyId);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  const summary = await SubscriptionFeaturesService.getSubscriptionSummary(
    companyId
  );

  res.json({
    success: true,
    data: summary,
  });
});

module.exports = {
  createSubscription,
  getSubscriptionByCompany,
  updateSubscription,
  renewSubscription,
  deactivateSubscription,
  checkSubscriptionStatus,
  getSubscriptionFeatures,
  checkFeatureAccess,
  getEnabledFeatures,
  getDisabledFeatures,
  getUpgradeSuggestions,
  getSubscriptionSummary,
};
