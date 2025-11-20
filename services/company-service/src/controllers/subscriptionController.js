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
  const { tier, amount, durationDays } = req.body;

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

    return result;
  });

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
    await subscriptionEvents.deactivated(companyId, trx);

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
