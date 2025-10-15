const asyncHandler = require('express-async-handler');
const Subscription = require('../models/subscription.model');
const Company = require('../models/company.model');
const { publishSubscriptionEvent } = require('../events/producer');

/**
 * @desc    Create a new subscription
 * @route   POST /api/subscriptions
 * @access  Private (Company Admin or Super Admin)
 */
const createSubscription = asyncHandler(async (req, res) => {
  const { company_id, tier, amount, currency, payment_reference, start_date, end_date } = req.body;

  // Validate required fields
  if (!company_id || !tier) {
    res.status(400);
    throw new Error('Company ID and tier are required');
  }

  // Check if company exists
  const company = await Company.findCompanyById(company_id);
  if (!company) {
    res.status(404);
    throw new Error('Company not found');
  }

  // Check if subscription already exists
  const existing = await Subscription.findByCompany(company_id);
  if (existing) {
    res.status(400);
    throw new Error('Subscription already exists for this company. Use update or renew instead.');
  }

  // Create subscription
  const subscription = await Subscription.create({
    company_id,
    tier,
    amount,
    currency,
    payment_reference,
    start_date,
    end_date,
  });

  // Publish event
  await publishSubscriptionEvent.created(subscription);

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
    throw new Error('Subscription not found for this company');
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
    throw new Error('Subscription not found');
  }

  const updateData = {
    ...(tier && { tier }),
    ...(amount !== undefined && { amount }),
    ...(currency && { currency }),
    ...(payment_reference && { payment_reference }),
    ...(is_active !== undefined && { is_active }),
  };

  const updated = await Subscription.update(companyId, updateData);

  // Publish event
  await publishSubscriptionEvent.updated(updated);

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
    throw new Error('Tier, amount, and duration (in days) are required');
  }

  const subscription = await Subscription.findByCompany(companyId);
  if (!subscription) {
    res.status(404);
    throw new Error('Subscription not found');
  }

  const renewed = await Subscription.renew(companyId, tier, amount, durationDays);

  // Publish event
  await publishSubscriptionEvent.renewed(renewed);

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
    throw new Error('Subscription not found');
  }

  const deactivated = await Subscription.deactivate(companyId);

  // Publish event
  await publishSubscriptionEvent.deactivated(companyId);

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
    throw new Error('Subscription not found');
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

  // Publish expiring event if subscription is expiring soon
  if (status.is_expiring_soon && subscription.is_active) {
    await publishSubscriptionEvent.expiring(subscription);
  }

  res.json({
    success: true,
    data: status,
  });
});

module.exports = {
  createSubscription,
  getSubscriptionByCompany,
  updateSubscription,
  renewSubscription,
  deactivateSubscription,
  checkSubscriptionStatus,
};

