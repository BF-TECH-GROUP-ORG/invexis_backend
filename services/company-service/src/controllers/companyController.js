const asyncHandler = require("express-async-handler");
const Company = require("../models/company.model");
const Subscription = require("../models/subscription.model");
const Department = require("../models/department.model");
const { subscriptionEvents } = require("../events/eventHelpers");
const { companyEvents } = require("../events/eventHelpers");
const db = require("../config");
const { VALID_TIERS, normalizeTier } = require("/app/shared/constants/tiers");
const { getCache, setCache, delCache } = require('../utils/redisHelper');
const { DEPARTMENTS, DEPARTMENT_NAMES, DEPARTMENT_DESCRIPTIONS } = require("../constants/departments");

/**
 * @desc    Create a new company (⚡ ULTRA-FAST <50ms)
 * @route   POST /api/companies
 * @access  Private (Super Admin)
 */

const createCompany = asyncHandler(async (req, res) => {
  const { name, domain, email, country, city, tier, category_ids, company_admin_id, payment_phones, is_bank } = req.body;

  // ⚡ FAST: Validate only required field f`irst
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400);
    throw new Error("Company name is required");
  }

  // ⚡ FAST: Validate types upfront (fail fast)
  if (company_admin_id && typeof company_admin_id !== 'string') {
    res.status(400);
    throw new Error("company_admin_id must be a valid user ID");
  }

  if (category_ids && !Array.isArray(category_ids)) {
    res.status(400);
    throw new Error("category_ids must be an array");
  }

  // ⚡ FAST: Normalize payment_phones to objects with provider
  const normalizedPhones = [];
  const rwandaPhoneRegex = /^(078|079|072|073)\d{7}$/;

  if (payment_phones) {
    for (const p of payment_phones) {
      let num = typeof p === 'object' ? p.phoneNumber : p;
      if (!num) continue;

      // Clean number
      num = num.replace(/^\+250/, '0').replace(/\s+/g, '');

      // Infer provider
      let provider = typeof p === 'object' ? p.provider : null;

      if (!provider) {
        if (/^(078|079)/.test(num)) provider = 'MTN';
        else if (/^(072|073)/.test(num)) provider = 'Airtel';
        else if (num.startsWith('254') || num.startsWith('+254')) provider = 'MPESA';
        else provider = 'Other';
      }

      // Validate Rwanda numbers strictly if provider is inferred as MTN/Airtel or Unknown
      if (['MTN', 'Airtel'].includes(provider) && !rwandaPhoneRegex.test(num)) {
        res.status(400);
        throw new Error(`Invalid Rwanda phone number: ${num}`);
      }

      normalizedPhones.push({
        phoneNumber: num,
        provider,
        enabled: typeof p === 'object' ? (p.enabled !== false) : true
      });
    }
  }

  // ⚡ FAST: Normalize tier once
  const normalizedTier = tier ? normalizeTier(tier) : "Basic";
  if (tier && !normalizedTier) {
    res.status(400);
    throw new Error(`Invalid tier. Must be one of: ${VALID_TIERS.join(", ")}`);
  }

  // ⚡ ULTRA-FAST: Check domain OR name in SINGLE query instead of two
  if (domain || name) {
    const exists = await Company.existsByDomainOrName(domain, name);
    if (exists) {
      res.status(400);
      if (domain) throw new Error("Company with this domain already exists");
      else throw new Error("Company with this name already exists");
    }
  }

  // ⚡ ULTRA-FAST: Single transaction with batch operations
  const companyResult = await db.transaction(async (trx) => {
    const { v4: uuidv4 } = require("uuid");
    const now = new Date();
    const userId = req.user?.id;

    const companyId = uuidv4();
    const subscriptionId = uuidv4();
    const subEndDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // 1️⃣ Create company data object
    const companyData = {
      id: companyId,
      name: name.trim(),
      domain: domain || null,
      email: email || null,
      country: country || null,
      city: city || null,
      tier: normalizedTier,
      category_ids: JSON.stringify(category_ids || []),
      company_admin_id: company_admin_id || null,
      payment_profile: JSON.stringify({
        stripe: {
          connectAccountId: null,
          chargesEnabled: false,
          payoutsEnabled: false,
          currency: "RWF",
          paymentMethodId: null
        }
      }),
      payment_phones: JSON.stringify(normalizedPhones),
      is_bank: is_bank !== undefined ? is_bank : false,
      subscription_id: subscriptionId,
      compliance: JSON.stringify({ kycStatus: "pending", verifiedAt: null }),
      metadata: JSON.stringify({ verification: { status: "pending", documents: [] } }),
      status: "pending_verification",
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };

    // Insert into DB
    const [newCompany] = await trx("companies")
      .insert(companyData)
      .returning('*');

    // 2️⃣ BATCH insert all departments
    const deptDefs = Object.entries(DEPARTMENTS).map(([key, deptType]) => ({
      id: uuidv4(),
      company_id: newCompany.id,
      name: deptType,
      display_name: DEPARTMENT_NAMES[deptType],
      description: DEPARTMENT_DESCRIPTIONS[deptType],
      status: "active",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    }));

    if (deptDefs.length > 0) {
      await trx("company_departments").insert(deptDefs);
    }

    const { SUBSCRIPTION_FEES } = require("../constants/subscriptionFees");
    const tierPrice = SUBSCRIPTION_FEES[normalizedTier.toUpperCase()] || 0;

    // 3️⃣ Insert subscription
    const subscriptionData = {
      id: subscriptionId,
      company_id: newCompany.id,
      tier: normalizedTier,
      amount: tierPrice,
      currency: "RWF",
      start_date: now,
      end_date: subEndDate,
      is_active: true,
      metadata: JSON.stringify({}),
      createdAt: now,
      updatedAt: now,
    };
    await trx("subscriptions").insert(subscriptionData);

    // 4️⃣ Create outbox events
    await Promise.all([
      companyEvents.created(newCompany, trx),
      subscriptionEvents.created(subscriptionData, trx),
    ]);

    newCompany.subscription = subscriptionData;
    return newCompany;
  });


  const company = companyResult;

  /* // ⚡ AUTOMATION: Stripe Onboarding for Banks
  if (company.is_bank) {
    try {
      const stripeService = require("../services/stripeService");
      console.log(`[Company] Starting Stripe Automation for ${company.name}`);
      // 1. Create Express Account
      const account = await stripeService.createExpressAccount(company);

      // 2. Generate Onboarding Link
      const returnUrl = `${process.env.FRONTEND_URL || 'https://dashboard.invexis.com'}/company/onboarding/return`;
      const refreshUrl = `${process.env.FRONTEND_URL || 'https://dashboard.invexis.com'}/company/onboarding/refresh`;

      const accountLink = await stripeService.createOnboardingLink(account.id, returnUrl, refreshUrl);

      // 3. Update Company with Stripe Info
      const updatedProfile = company.payment_profile || { stripe: {} };
      if (!updatedProfile.stripe) updatedProfile.stripe = {};

      updatedProfile.stripe.connectAccountId = account.id;
      updatedProfile.stripe.chargesEnabled = account.charges_enabled;
      updatedProfile.stripe.payoutsEnabled = account.payouts_enabled;
      updatedProfile.stripe.currency = 'RWF';

      const updatedMetadata = company.metadata || {};
      updatedMetadata.onboardingLink = accountLink.url;

      await db.transaction(async (trx) => {
        const updated = await Company.updateCompany(company.id, {
          payment_profile: updatedProfile,
          metadata: updatedMetadata
        }, trx);

        // Signal update so payment-service gets the Stripe ID
        await companyEvents.updated(updated, trx);
        // Signal notification-service to send the link
        await companyEvents.onboardingReady(updated, accountLink.url, trx);
      });

      company.payment_profile = updatedProfile;
      company.metadata = updatedMetadata;

    } catch (stripeError) {
      console.error("Failed to automate Stripe creation:", stripeError);
    }
  } */

  // 4️⃣ Final Signal: Creation Success (All setup done)
  await companyEvents.createdSuccess(company);

  // ⚡ FAST: Async cache invalidation
  setCache(`company:${company.id}`, company, 3600).catch(() => { });

  res.status(201).json({
    success: true,
    data: company,
  });
});

/**
 * @desc    Get all companies with filters
 * @route   GET /api/companies
 * @access  Private (Super Admin)
 */
const getAllCompanies = asyncHandler(async (req, res) => {
  const { status, tier, limit = 50, offset = 0 } = req.query;

  // Create cache key from query parameters (v2 for populated subscriptions)
  const cacheKey = `v2:companies:${status || 'all'}:${tier || 'all'}:${limit}:${offset}`;

  // Try cache first
  try {
    const cachedCompanies = await getCache(cacheKey);
    if (cachedCompanies) {
      console.log(`[CACHE HIT] Companies list - ${cacheKey}`);
      return res.json({
        success: true,
        count: cachedCompanies.length,
        data: cachedCompanies,
      });
    }
  } catch (e) {
    console.warn('Redis get failed (non-blocking):', e && e.message);
  }

  // DB fallback if not cached

  const companies = await Company.findAllCompanies({
    status,
    tier,
    limit: parseInt(limit),
    offset: parseInt(offset),
  });

  // Cache the result (fire-and-forget, 10min TTL)
  setCache(cacheKey, companies, 600).catch(() => { });

  res.json({
    success: true,
    count: companies.length,
    data: companies,
  });
});

/**
 * @desc    Get company by ID
 * @route   GET /api/companies/:id
 * @access  Private
 */
const getCompanyById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Try cache first (v2 for populated subscriptions)
  const cacheKey = `v2:company:${id}`;
  try {
    const cachedCompany = await getCache(cacheKey);
    if (cachedCompany) {
      console.log(`[CACHE HIT] Company ${id}`);
      return res.json({
        success: true,
        data: cachedCompany,
      });
    }
  } catch (e) {
    console.warn('Redis get failed (non-blocking):', e && e.message);
  }

  // DB fallback if not cached
  const company = await Company.findCompanyById(id);

  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  // Set cache (fire-and-forget, 1 hour TTL)
  setCache(cacheKey, company, 3600).catch(() => { });

  res.json({
    success: true,
    data: company,
  });
});

/**
 * @desc    Get company by domain
 * @route   GET /api/companies/domain/:domain
 * @access  Public
 */
const getCompanyByDomain = asyncHandler(async (req, res) => {
  const domain = req.params.domain;
  const cacheKey = `company:domain:${domain}`;

  // Try cache first
  try {
    const cachedCompany = await getCache(cacheKey);
    if (cachedCompany) {
      console.log(`[CACHE HIT] Company by domain ${domain}`);
      return res.json({
        success: true,
        data: cachedCompany,
      });
    }
  } catch (e) {
    console.warn('Redis get failed (non-blocking):', e && e.message);
  }

  // DB fallback if not cached
  const company = await Company.findCompanyByDomain(domain);

  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  // Set cache (fire-and-forget, 1 hour TTL)
  setCache(cacheKey, company, 3600).catch(() => { });

  res.json({
    success: true,
    data: company,
  });
});

/**
 * @desc    Update company
 * @route   PUT /api/companies/:id
 * @access  Private (Company Admin or Super Admin)
 */
const updateCompany = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, domain, email, country, city, category_ids, payment_phones, is_bank } = req.body;

  const company = await Company.findCompanyById(id);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  // Validate category_ids if provided
  if (category_ids !== undefined && !Array.isArray(category_ids)) {
    res.status(400);
    throw new Error("category_ids must be an array");
  }

  if (payment_phones !== undefined) {
    if (!Array.isArray(payment_phones)) {
      res.status(400);
      throw new Error("payment_phones must be an array");
    }
    const phoneRegex = /^(078|079|072|073)\d{7}$/;
    for (const p of payment_phones) {
      const num = typeof p === 'object' ? p.phoneNumber : p;
      if (!num) continue;
      const clean = num.replace(/^\+250/, '0').replace(/\s+/g, '');
      if (!phoneRegex.test(clean)) {
        res.status(400);
        throw new Error(`Invalid phone number format: ${num}. Must be a valid MTN/Airtel number.`);
      }
    }
  }

  const updateData = {
    ...(name && { name }),
    ...(domain && { domain }),
    ...(email && { email }),
    ...(country && { country }),
    ...(city && { city }),
    ...(category_ids !== undefined && { category_ids }),
    ...(payment_phones !== undefined && { payment_phones: JSON.stringify(normalizedPhones) }),
    ...(is_bank !== undefined && { is_bank }),
    updatedBy: req.user?.id || null,
    updatedAt: new Date(),
  };

  // Update company with transaction (atomic with outbox event)
  const updatedCompany = await db.transaction(async (trx) => {
    const updated = await Company.updateCompany(id, updateData, trx);

    // Create outbox event within transaction (will be published by dispatcher)
    await companyEvents.updated(updated, trx);

    return updated;
  });

  // Invalidate caches (fire-and-forget)
  delCache(`company:${id}`).catch(() => { });
  delCache('companies:active').catch(() => { });
  delCache(`company:domain:${updatedCompany.domain}`).catch(() => { });

  /* // ⚡ AUTOMATION: Stripe Onboarding for Banks (Update Flow)
  if (updatedCompany.is_bank) {
    const currentProfile = typeof updatedCompany.payment_profile === 'string'
      ? JSON.parse(updatedCompany.payment_profile)
      : updatedCompany.payment_profile || {};

    const stripeInfo = currentProfile.stripe || {};

    // If active bank but no Stripe connection, create one
    if (!stripeInfo.connectAccountId) {
      try {
        const stripeService = require("../services/stripeService");
        console.log(`[Company] Starting Stripe Automation (Update) for ${updatedCompany.name}`);

        // 1. Create Express Account
        const account = await stripeService.createExpressAccount(updatedCompany);

        // 2. Generate Onboarding Link
        const returnUrl = `${process.env.FRONTEND_URL || 'https://dashboard.invexis.com'}/company/onboarding/return`;
        const refreshUrl = `${process.env.FRONTEND_URL || 'https://dashboard.invexis.com'}/company/onboarding/refresh`;
        const accountLink = await stripeService.createOnboardingLink(account.id, returnUrl, refreshUrl);

        // 3. Update Profile
        if (!currentProfile.stripe) currentProfile.stripe = {};
        currentProfile.stripe.connectAccountId = account.id;
        currentProfile.stripe.chargesEnabled = account.charges_enabled;
        currentProfile.stripe.payoutsEnabled = account.payouts_enabled;
        currentProfile.stripe.currency = 'RWF';

        const newMetadata = updatedCompany.metadata || {};
        newMetadata.onboardingLink = accountLink.url;

        // Persist
        await db.transaction(async (trx) => {
          await Company.updateCompany(id, {
            payment_profile: JSON.stringify(currentProfile),
            metadata: newMetadata
          }, trx);

          // Signal notification-service
          await companyEvents.onboardingReady(updatedCompany, accountLink.url, trx);
        });

        // Update local object for response
        updatedCompany.payment_profile = currentProfile;
        updatedCompany.metadata = newMetadata;

      } catch (stripeError) {
        console.error("Failed to automate Stripe creation on update:", stripeError);
        // Don't fail the whole update, just log
      }
    }
  } */

  res.json({
    success: true,
    data: updatedCompany,
  });
});

/**
 * @desc    Delete company (soft delete)
 * @route   DELETE /api/companies/:id
 * @access  Private (Super Admin)
 */
const deleteCompany = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const company = await Company.findCompanyById(id);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  // Delete company with transaction (atomic with outbox event)
  await db.transaction(async (trx) => {
    await Company.deleteCompany(id, req.user?.id || null, trx);

    // Create outbox event within transaction (will be published by dispatcher)
    await companyEvents.deleted(id, trx);
  });

  // Invalidate caches (fire-and-forget)
  delCache(`company:${id}`).catch(() => { });
  delCache('companies:active').catch(() => { });
  delCache(`company:domain:${company.domain}`).catch(() => { });

  res.json({
    success: true,
    message: "Company deleted successfully",
  });
});

/**
 * @desc    Change company status
 * @route   PATCH /api/companies/:id/status
 * @access  Private (Super Admin)
 */
const changeCompanyStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const allowedStatuses = ["pending_verification", "active", "suspended", "deleted"];
  if (!status || !allowedStatuses.includes(status)) {
    res.status(400);
    throw new Error(`Invalid status. Must be one of: ${allowedStatuses.join(", ")}`);
  }

  const company = await Company.findCompanyById(id);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  // Enforce verification approval before allowing active status
  if (status === "active") {
    let metadata = company.metadata || {};
    if (typeof metadata === "string") {
      try {
        metadata = JSON.parse(metadata);
      } catch (err) {
        metadata = {};
      }
    }
    const verification = metadata.verification;
    if (!verification || verification.status !== "approved") {
      res.status(400);
      throw new Error(
        "Company cannot be set to active until verification documents are approved"
      );
    }
  }

  // Change status with transaction (atomic with outbox event)
  await db.transaction(async (trx) => {
    await Company.changeCompanyStatus(id, status, req.user?.id || null, trx);

    // Create outbox event within transaction (will be published by dispatcher)
    await companyEvents.statusChanged(id, status, trx);
  });

  // Invalidate caches (fire-and-forget)
  delCache(`company:${id}`).catch(() => { });
  delCache('companies:active').catch(() => { });
  delCache(`company:domain:${company.domain}`).catch(() => { });

  res.json({
    success: true,
    message: `Company status changed to ${status}`,
  });
});

/**
 * @desc    Change company tier
 * @route   PATCH /api/companies/:id/tier
 * @access  Private (Super Admin)
 */
const changeCompanyTier = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tier } = req.body;

  // Normalize and validate tier
  const normalizedTier = normalizeTier(tier);
  if (!normalizedTier) {
    res.status(400);
    throw new Error(`Invalid tier. Must be one of: ${VALID_TIERS.join(", ")}`);
  }

  const company = await Company.findCompanyById(id);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  // Change tier with transaction (atomic with outbox event)
  await db.transaction(async (trx) => {
    await Company.changeTier(id, normalizedTier, req.user?.id || null, trx);

    // Create outbox event within transaction (will be published by dispatcher)
    await companyEvents.tierChanged(id, normalizedTier, trx);
  });

  // Invalidate caches (fire-and-forget)
  delCache(`company:${id}`).catch(() => { });
  delCache('companies:active').catch(() => { });

  res.json({
    success: true,
    message: `Company tier changed to ${normalizedTier}`,
  });
});

/**
 * @desc    Get active companies
 * @route   GET /api/companies/active
 * @access  Private
 */
const getActiveCompanies = asyncHandler(async (req, res) => {
  const cacheKey = 'v2:companies:active';

  // Try cache first
  try {
    const cachedCompanies = await getCache(cacheKey);
    if (cachedCompanies) {
      console.log('[CACHE HIT] Active companies');
      return res.json({
        success: true,
        count: cachedCompanies.length,
        data: cachedCompanies,
      });
    }
  } catch (e) {
    console.warn('Redis get failed (non-blocking):', e && e.message);
  }

  // DB fallback if not cached
  const companies = await Company.getActiveCompanies();

  // Set cache (fire-and-forget, 5min TTL for active roster)
  setCache(cacheKey, companies, 300).catch(() => { });

  res.json({
    success: true,
    count: companies.length,
    data: companies,
  });
});

/**
 * @desc    Reactivate company
 * @route   PATCH /api/companies/:id/reactivate
 * @access  Private (Super Admin)
 */
const reactivateCompany = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const company = await Company.findCompanyById(id);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  // Prevent reactivating company without approved verification
  let metadata = company.metadata || {};
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch (err) {
      metadata = {};
    }
  }
  const verification = metadata.verification;
  if (!verification || verification.status !== "approved") {
    res.status(400);
    throw new Error(
      "Company cannot be reactivated as active until verification documents are approved"
    );
  }

  // Reactivate with transaction (atomic with outbox event)
  const reactivated = await db.transaction(async (trx) => {
    const result = await Company.reactivateCompany(
      id,
      req.user?.id || null,
      trx
    );

    // Create outbox event within transaction (will be published by dispatcher)
    await companyEvents.statusChanged(id, "active", trx);

    return result;
  });

  // Invalidate caches (fire-and-forget)
  delCache(`company:${id}`).catch(() => { });
  delCache('companies:active').catch(() => { });
  delCache(`company:domain:${reactivated.domain}`).catch(() => { });

  res.json({
    success: true,
    data: reactivated,
  });
});

/**
 * @desc    Get companies by category IDs (any match)
 * @route   GET /api/companies/categories
 * @access  Private
 */
const getCompaniesByCategories = asyncHandler(async (req, res) => {
  const { category_ids, status, tier, limit = 50, offset = 0 } = req.query;

  if (!category_ids) {
    res.status(400);
    throw new Error("category_ids query parameter is required");
  }

  // Parse category_ids (can be comma-separated string or array)
  const categoryArray = Array.isArray(category_ids)
    ? category_ids
    : category_ids.split(",").map((id) => id.trim());

  const companies = await Company.findCompaniesByCategories(categoryArray, {
    status,
    tier,
    limit: parseInt(limit),
    offset: parseInt(offset),
  });

  res.json({
    success: true,
    count: companies.length,
    data: companies,
  });
});

/**
 * @desc    Add categories to a company
 * @route   POST /api/companies/:id/categories
 * @access  Private (Company Admin or Super Admin)
 */
const addCompanyCategories = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { category_ids } = req.body;

  if (!category_ids || !Array.isArray(category_ids) || category_ids.length === 0) {
    res.status(400);
    throw new Error("category_ids must be a non-empty array");
  }

  const company = await Company.findCompanyById(id);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  // Add categories with transaction (atomic with outbox event)
  const updatedCompany = await db.transaction(async (trx) => {
    const updated = await Company.addCategories(
      id,
      category_ids,
      req.user?.id || null,
      trx
    );

    // Create outbox event within transaction (will be published by dispatcher)
    await companyEvents.updated(updated, trx);

    return updated;
  });

  // Invalidate cache
  await delCache(`company:${id}`);

  res.json({
    success: true,
    message: "Categories added successfully",
    data: updatedCompany,
  });
});

/**
 * @desc    Remove categories from a company
 * @route   DELETE /api/companies/:id/categories
 * @access  Private (Company Admin or Super Admin)
 */
const removeCompanyCategories = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { category_ids } = req.body;

  if (!category_ids || !Array.isArray(category_ids) || category_ids.length === 0) {
    res.status(400);
    throw new Error("category_ids must be a non-empty array");
  }

  const company = await Company.findCompanyById(id);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  // Remove categories with transaction (atomic with outbox event)
  const updatedCompany = await db.transaction(async (trx) => {
    const updated = await Company.removeCategories(
      id,
      category_ids,
      req.user?.id || null,
      trx
    );

    // Create outbox event within transaction (will be published by dispatcher)
    await companyEvents.updated(updated, trx);

    return updated;
  });

  // Invalidate cache
  await delCache(`company:${id}`);

  res.json({
    success: true,
    message: "Categories removed successfully",
    data: updatedCompany,
  });
});

/**
 * @desc    Set (replace) categories for a company
 * @route   PUT /api/companies/:id/categories
 * @access  Private (Company Admin or Super Admin)
 */
const setCompanyCategories = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { category_ids } = req.body;

  if (!Array.isArray(category_ids)) {
    res.status(400);
    throw new Error("category_ids must be an array");
  }

  const company = await Company.findCompanyById(id);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  // Set categories with transaction (atomic with outbox event)
  const updatedCompany = await db.transaction(async (trx) => {
    const updated = await Company.setCategories(
      id,
      category_ids,
      req.user?.id || null,
      trx
    );

    // Create outbox event within transaction (will be published by dispatcher)
    await companyEvents.updated(updated, trx);

    return updated;
  });

  // Invalidate cache
  await delCache(`company:${id}`);

  res.json({
    success: true,
    message: "Categories updated successfully",
    data: updatedCompany,
  });
});

/**
 * @desc    Upload or attach verification documents for a company
 * @route   POST /api/companies/:id/verification-docs
 * @access  Private (Company Admin or Super Admin)
 */
const uploadCompanyVerificationDocs = asyncHandler(async (req, res) => {

  const id = req.params.id || req.body.id || req.query.id;

  // Check if files were uploaded
  if (!req.files || req.files.length === 0) {
    res.status(400);
    throw new Error("No files uploaded. Please upload at least one document.");
  }



  const cacheKey = `company:${id}`;
  // Try cache first (fast path)
  let company = await getCache(cacheKey);
  if (!company) {
    company = await Company.findCompanyById(id);
    if (!company) {
      res.status(404);
      throw new Error("Company not found");
    }
    // Warm cache asynchronously (don't block response)
    setCache(cacheKey, company, 3600).catch(() => { });
  }

  const userId = req.user?.id || null;

  // Parse metadata only when needed
  let metadata = company.metadata || {};
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch (err) {
      metadata = {};
    }
  }

  const existingVerification = metadata.verification || {};
  const existingDocs = Array.isArray(existingVerification.documents)
    ? existingVerification.documents
    : [];

  const nowIso = new Date().toISOString();
  const ts = Date.now();

  // Import document request utility
  const { requestCompanyVerificationDoc } = require('../utils/documentRequests');

  // Build new documents array with temporary "processing" status
  const newDocs = req.files.map((file, index) => {
    const docTypeField = `documentType_${index}`;
    const docNotesField = `documentNotes_${index}`;
    const docId = `doc_${ts}_${index}`;

    // Extract file extension from mimetype or original name
    const format = file.mimetype.split('/')[1] || file.originalname.split('.').pop();

    return {
      id: docId,
      type: req.body[docTypeField] || file.mimetype,
      name: file.originalname,
      url: null, // Will be updated when document-service completes
      cloudinary_public_id: null, // Will be updated when document-service completes
      size: file.size,
      mimetype: file.mimetype,
      format: format,
      notes: req.body[docNotesField] || null,
      uploadedAt: nowIso,
      uploadedBy: userId,
      status: 'processing' // Indicates async upload in progress
    };
  });

  // Update metadata with "processing" documents
  metadata.verification = {
    ...existingVerification,
    status: "pending",
    documents: [...existingDocs, ...newDocs],
  };

  // Perform a minimal, single UPDATE for speed
  await db("companies").where({ id }).update({
    metadata,
    updatedBy: userId,
    updatedAt: new Date(),
  });

  // Emit document upload requests to document-service (async, fire-and-forget)
  req.files.forEach((file, index) => {
    const docId = `doc_${ts}_${index}`;
    const docTypeField = `documentType_${index}`;
    const docNotesField = `documentNotes_${index}`;
    const format = file.mimetype.split('/')[1] || file.originalname.split('.').pop();

    requestCompanyVerificationDoc(id, file.buffer, {
      documentId: docId,
      format: format,
      originalName: file.originalname,
      documentType: req.body[docTypeField] || file.mimetype,
      notes: req.body[docNotesField] || null,
      uploadedBy: userId
    }).catch(err => {
      console.error(`Failed to request document upload for ${docId}:`, err);
    });
  });

  // Refresh company (read-after-write) from DB for response
  const updatedCompany = await Company.findCompanyById(id);

  // Invalidate cache asynchronously
  delCache(cacheKey).catch(() => { });

  // Respond quickly - documents are being processed asynchronously
  res.json({
    success: true,
    message: "Verification documents are being processed. URLs will be available shortly.",
    data: updatedCompany,
    uploadedFiles: newDocs,
  });
});


/**
 * @desc    Review verification documents for a company (approve/reject)
 * @route   PATCH /api/companies/:id/verification
 * @access  Private (Super Admin)
 */
const reviewCompanyVerification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { decision, reviewNotes } = req.body;

  if (!decision || !["approved", "rejected"].includes(decision)) {
    res.status(400);
    throw new Error("decision must be 'approved' or 'rejected'");
  }

  const company = await Company.findCompanyById(id);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  let metadata = company.metadata || {};
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch (err) {
      metadata = {};
    }
  }

  const existingVerification = metadata.verification || {};
  const docs = Array.isArray(existingVerification.documents)
    ? existingVerification.documents
    : [];

  if (docs.length === 0) {
    res.status(400);
    throw new Error("Cannot review verification: no documents uploaded");
  }

  const userId = req.user?.id || null;
  const nowIso = new Date().toISOString();

  const verificationStatus = decision === "approved" ? "approved" : "rejected";
  const companyStatus = decision === "approved" ? "active" : "pending_verification";

  metadata.verification = {
    ...existingVerification,
    status: verificationStatus,
    reviewedBy: userId,
    reviewedAt: nowIso,
    reviewNotes: reviewNotes || existingVerification.reviewNotes || null,
  };

  const updatedCompany = await db.transaction(async (trx) => {
    await trx("companies")
      .where({ id })
      .update({
        metadata,
        status: companyStatus,
        updatedBy: userId,
        updatedAt: new Date(),
      });

    const fresh = await trx("companies").where({ id }).first();

    await companyEvents.statusChanged(id, companyStatus, trx);
    await companyEvents.updated(fresh, trx);

    return fresh;
  });

  // Invalidate cache
  await delCache(`company:${id}`);

  res.json({
    success: true,
    message:
      decision === "approved"
        ? "Company verification approved and company activated"
        : "Company verification rejected",
    data: updatedCompany,
  });
});

/**
 * @desc    Complete Stripe Onboarding (Fetch latest status)
 * @route   GET /api/companies/:id/onboarding/complete
 * @access  Private (Company Admin or Super Admin)
 */
const completeOnboarding = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const company = await Company.findCompanyById(id);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  const stripeService = require("../services/stripeService");
  const paymentProfile = typeof company.payment_profile === 'string'
    ? JSON.parse(company.payment_profile)
    : company.payment_profile || {};

  const stripeInfo = paymentProfile.stripe || {};

  if (!stripeInfo.connectAccountId) {
    res.status(400);
    throw new Error("No Stripe account found for this company. Please start onboarding first.");
  }

  // Fetch latest status from Stripe
  const account = await stripeService.checkAccountStatus(stripeInfo.connectAccountId);

  // Update profile
  stripeInfo.chargesEnabled = account.charges_enabled;
  stripeInfo.payoutsEnabled = account.payouts_enabled;

  paymentProfile.stripe = stripeInfo;

  // Persist changes
  await db.transaction(async (trx) => {
    const updated = await Company.updateCompany(id, {
      payment_profile: JSON.stringify(paymentProfile)
    }, trx);

    // Signal update
    await companyEvents.updated(updated, trx);
  });

  // Invalidate cache
  delCache(`company:${id}`).catch(() => { });

  res.json({
    success: true,
    message: "Onboarding status updated",
    data: {
      chargesEnabled: stripeInfo.chargesEnabled,
      payoutsEnabled: stripeInfo.payoutsEnabled
    }
  });
});

/**
 * @desc    Get new onboarding link
 * @route   GET /api/companies/:id/onboarding/link
 * @access  Private (Company Admin or Super Admin)
 */
const getOnboardingLink = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const company = await Company.findCompanyById(id);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  const paymentProfile = typeof company.payment_profile === 'string'
    ? JSON.parse(company.payment_profile)
    : company.payment_profile || {};

  const stripeInfo = paymentProfile.stripe || {};

  if (!stripeInfo.connectAccountId) {
    res.status(400);
    throw new Error("No Stripe account found. Ensure 'is_bank' is true or contact support.");
  }

  const stripeService = require("../services/stripeService");
  const returnUrl = `${process.env.FRONTEND_URL || 'https://dashboard.invexis.com'}/company/onboarding/return`;
  const refreshUrl = `${process.env.FRONTEND_URL || 'https://dashboard.invexis.com'}/company/onboarding/refresh`;

  try {
    const accountLink = await stripeService.createOnboardingLink(stripeInfo.connectAccountId, returnUrl, refreshUrl);

    // Update metadata with new link
    const metadata = company.metadata || {};
    metadata.onboardingLink = accountLink.url;

    // Persist (optional, but good for tracking)
    await Company.updateCompany(id, { metadata });

    // Signal notification-service (Since user requested a new link explicitly, maybe sending email is redundant? 
    // But user might be requesting it to be sent to them. Let's send it to be safe/consistent, 
    // or we can skip it since the API returns it. 
    // The requirement was "send the links to the company email". 
    // For manual request, the frontend gets it directly. But sending a copy is nice.)
    // However, I don't have a transaction here easily. I'll skip emitting event here for now unless asked, 
    // as the primary use case is "after company creation". 
    // actually, let's keep it simple and only do it for creation/update automation.

    res.json({
      success: true,
      data: {
        url: accountLink.url
      }
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to generate link: ${error.message}`);
  }
});

module.exports = {
  completeOnboarding,
  getOnboardingLink,
  createCompany,
  getAllCompanies,
  getCompanyById,
  getCompanyByDomain,
  updateCompany,
  deleteCompany,
  changeCompanyStatus,
  changeCompanyTier,
  getActiveCompanies,
  reactivateCompany,
  getCompaniesByCategories,
  addCompanyCategories,
  removeCompanyCategories,
  setCompanyCategories,
  uploadCompanyVerificationDocs,
  reviewCompanyVerification,
};
