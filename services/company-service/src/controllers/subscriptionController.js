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
 * @desc    Manual Unlock/Renew (Super Admin only - No payment service)
 * @route   POST /api/subscriptions/company/:companyId/manual-unlock
 * @access  Private (Super Admin)
 */
const manualUnlock = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { tier, amount, durationDays, reason, plan } = req.body;

  if (!tier) {
    res.status(400);
    throw new Error("Tier is required for manual unlock");
  }

  const { TIER_FEATURES } = require("/app/shared/config/tierFeatures.config");
  const config = TIER_FEATURES[tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase()] || TIER_FEATURES.Basic;

  // Smart Calculation: If no amount/days provided, use Plan logic
  const selectedPlan = (plan || '1m').toLowerCase();
  const months = parseInt(selectedPlan) || 1;
  const calculatedDays = months * 30;
  const calculatedAmount = config.pricing?.[selectedPlan] || (config.price * months);

  const finalDuration = durationDays || calculatedDays;
  const finalAmount = amount !== undefined ? amount : calculatedAmount;

  const subscription = await Subscription.findByCompany(companyId);
  if (!subscription) {
    res.status(404);
    throw new Error("Subscription not found");
  }

  // Renewal with transaction (Manual - No payment event)
  const renewed = await db.transaction(async (trx) => {
    const result = await Subscription.renew(
      companyId,
      tier.toLowerCase(),
      finalAmount,
      finalDuration,
      trx
    );

    // Update company status directly
    await Company.changeCompanyStatus(companyId, "active", req.user.userId, trx);
    await Company.changeTier(companyId, tier.toLowerCase(), req.user.userId, trx);

    // Record outbox event for sync
    await subscriptionEvents.renewed(result, trx);

    return result;
  });

  console.log(`✅ [ManualUnlock] Company ${companyId} unlocked by admin ${req.user.userId}. Reason: ${reason}`);

  res.json({
    success: true,
    message: `Company subscription unlocked manually (${config.name}). Status set to active.`,
    data: renewed,
  });
});

/**
 * @desc    Initiate Subscription Payment (Company Admin Trigger)
 * @route   POST /api/subscriptions/company/:companyId/initiate-payment
 * @access  Private (Company Admin or Super Admin)
 */
const initiateSubscriptionPayment = asyncHandler(async (req, res) => {
  // Use companyId from body or params for maximum flexibility
  const companyId = req.body.companyId || req.params.companyId;
  const { tier, phone, paymentMethod, plan } = req.body; // plan: '1m', '3m', '6m', '12m'

  if (!companyId) {
    res.status(400);
    throw new Error("companyId is required to initiate payment");
  }

  // Smart Security: Company admins can only pay for their own company
  if (req.user.role === 'company_admin' && req.user.companyId !== companyId) {
    console.warn(`🚨 [Security] Admin ${req.user.userId} attempted to pay for unauthorized company ${companyId}`);
    res.status(403);
    throw new Error("You are not authorized to initiate payments for this company");
  }

  if (!tier || !phone) {
    res.status(400);
    throw new Error("Tier and payment phone number are required to initiate payment");
  }

  const { TIER_FEATURES } = require("/app/shared/config/tierFeatures.config");
  const config = TIER_FEATURES[tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase()] || TIER_FEATURES.Basic;

  // Calculate Amount and Duration professionally
  const selectedPlan = (plan || '1m').toLowerCase();
  const amount = config.pricing?.[selectedPlan] || config.price;
  const months = parseInt(selectedPlan) || 1;
  const durationDays = months * 30;

  const subscription = await Subscription.findByCompany(companyId);
  if (!subscription) {
    res.status(404);
    throw new Error("Subscription not found for this company");
  }

  const company = await Company.findCompanyById(companyId);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  // Determine Gateway & Payment Method professionally
  let gateway = 'mtn_momo';
  let method = 'mobile_money';
  const normalizedMethod = (paymentMethod || 'mtn').toLowerCase();

  if (normalizedMethod === 'cash') {
    gateway = 'manual';
    method = 'cash';
  } else if (normalizedMethod === 'bank' || normalizedMethod === 'bank_transfer') {
    gateway = 'manual';
    method = 'bank_transfer';
  } else if (normalizedMethod === 'airtel') {
    gateway = 'airtel_money';
    method = 'mobile_money';
  } else {
    gateway = 'mtn_momo';
    method = 'mobile_money';
  }

  // Phone is required for mobile money only
  const isMobileMoney = gateway === 'mtn_momo' || gateway === 'airtel_money';
  if (isMobileMoney && !phone) {
    res.status(400);
    throw new Error(`Phone number is required for ${gateway.replace('_', ' ').toUpperCase()} payments`);
  }

  const targetPhone = phone || company.phone;

  const { emit } = require("../events/producer");
  const payload = {
    event: 'PAYMENT_REQUESTED',
    source: 'company-service',
    paymentType: 'SUBSCRIPTION',
    referenceId: `SUB-DIRECT-${companyId}-${Date.now()}`,
    companyId: companyId,
    amount: amount,
    currency: 'RWF',
    description: `${config.name} (${amount} RWF) via ${method.replace('_', ' ').toUpperCase()}`,
    paymentMethod: method,
    gateway: gateway,
    phoneNumber: isMobileMoney ? targetPhone : null,
    idempotencyKey: `SUB-${tier.toLowerCase()}-${normalizedMethod}-${Date.now()}`,
    customer: {
      name: company.name,
      email: company.email,
      phone: targetPhone
    },
    lineItems: [{
      id: `tier_${tier.toLowerCase()}`,
      name: config.name,
      qty: 1,
      price: amount
    }],
    metadata: {
      subscriptionId: subscription.id,
      tier: tier.toLowerCase(),
      durationDays: durationDays,
      plan: selectedPlan
    }
  };

  await emit('subscription.payment.requested', payload);

  res.json({
    success: true,
    message: isMobileMoney
      ? `Payment request for ${config.name} (${amount} RWF) triggered to ${targetPhone}`
      : `${method.replace('_', ' ').toUpperCase()} payment for ${config.name} recorded`,
    data: { amount, tier: config.name, phone: isMobileMoney ? targetPhone : null, gateway, method }
  });
});

/**
 * @desc    Renew subscription (Explicit Payment Trigger)
 * @route   POST /api/subscriptions/company/:companyId/renew
 * @access  Private (Company Admin or Super Admin)
 */
const renewSubscription = asyncHandler(async (req, res) => {
  const companyId = req.body.companyId || req.params.companyId;
  const { tier, paymentMethod, phone, plan } = req.body; // plan: '1m', '3m', '6m', '12m'

  if (!companyId) {
    res.status(400);
    throw new Error("companyId is required for renewal");
  }

  // Smart Security: Company admins can only renew their own company
  if (req.user.role === 'company_admin' && req.user.companyId !== companyId) {
    res.status(403);
    throw new Error("You are not authorized to renew subscriptions for this company");
  }

  if (!tier) {
    res.status(400);
    throw new Error("Tier is required for renewal");
  }

  const { TIER_FEATURES } = require("/app/shared/config/tierFeatures.config");
  const config = TIER_FEATURES[tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase()] || TIER_FEATURES.Basic;

  const selectedPlan = (plan || '1m').toLowerCase();
  const amount = config.pricing?.[selectedPlan] || config.price;
  const months = parseInt(selectedPlan) || 1;
  const durationDays = months * 30;

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

    // Determine Gateway & Payment Method professionally
    let gateway = 'mtn_momo';
    let method = 'mobile_money';
    const normalizedMethod = (paymentMethod || 'mtn').toLowerCase();

    if (normalizedMethod === 'cash') {
      gateway = 'manual';
      method = 'cash';
    } else if (normalizedMethod === 'bank' || normalizedMethod === 'bank_transfer') {
      gateway = 'manual';
      method = 'bank_transfer';
    } else if (normalizedMethod === 'airtel') {
      gateway = 'airtel_money';
      method = 'mobile_money';
    } else {
      gateway = 'mtn_momo';
      method = 'mobile_money';
    }

    const isMobileMoney = gateway === 'mtn_momo' || gateway === 'airtel_money';
    const targetPhone = phone || company.phone;

    const payload = {
      event: 'PAYMENT_REQUESTED',
      source: 'company-service',
      paymentType: 'SUBSCRIPTION',
      referenceId: renewed.id || `RENEW-${companyId}-${Date.now()}`,
      companyId: companyId,
      amount: amount,
      currency: 'RWF',
      description: `${config.name} Renewal (${amount} RWF) via ${method.replace('_', ' ').toUpperCase()}`,
      paymentMethod: method,
      gateway: gateway,
      phoneNumber: isMobileMoney ? targetPhone : null,
      idempotencyKey: `RENEW-${tier.toLowerCase()}-${normalizedMethod}-${Date.now()}`,
      customer: {
        name: company.name,
        email: company.email,
        phone: targetPhone
      },
      lineItems: [{
        id: `tier_${tier.toLowerCase()}`,
        name: config.name,
        qty: 1,
        price: amount
      }],
      metadata: {
        subscriptionId: renewed.id,
        tier: tier.toLowerCase(),
        durationDays: durationDays,
        plan: selectedPlan
      }
    };

    await emit('subscription.payment.requested', payload);
    console.log(`✅ [RenewSubscription] Payment request (${amount} RWF) triggered to ${targetPhone}`);
  } catch (err) {
    console.warn('⚠️ [RenewSubscription] Payment request failed (non-blocking):', err.message);
  }

  res.json({
    success: true,
    message: "Subscription renewed and payment initiated",
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
  manualUnlock,
  initiateSubscriptionPayment,
  deactivateSubscription,
  checkSubscriptionStatus,
  getSubscriptionFeatures,
  checkFeatureAccess,
  getEnabledFeatures,
  getDisabledFeatures,
  getUpgradeSuggestions,
  getSubscriptionSummary,
};
