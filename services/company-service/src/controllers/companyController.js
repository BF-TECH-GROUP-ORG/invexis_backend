const asyncHandler = require("express-async-handler");
const Company = require("../models/company.model");
const Subscription = require("../models/subscription.model");
const { subscriptionEvents } = require("../events/eventHelpers");
const { companyEvents } = require("../events/eventHelpers");
const db = require("../config");

/**
 * @desc    Create a new company
 * @route   POST /api/companies
 * @access  Private (Super Admin)
 */
const createCompany = asyncHandler(async (req, res) => {
  const { name, domain, email, phone, country, city, tier, coordinates } =
    req.body;

  // Validate required fields
  if (!name) {
    res.status(400);
    throw new Error("Company name is required");
  }

  // Check if company with same domain or name exists
  if (domain) {
    const domainExists = await Company.existsByDomain(domain);
    if (domainExists) {
      res.status(400);
      throw new Error("Company with this domain already exists");
    }
  }

  const nameExists = await Company.existsByName(name);
  if (nameExists) {
    res.status(400);
    throw new Error("Company with this name already exists");
  }

  // Create company with transaction (atomic with outbox event)
  const company = await db.transaction(async (trx) => {
    const newCompany = await Company.create(
      {
        name,
        domain,
        email,
        phone,
        country,
        city,
        coordinates,
        tier,
        createdBy: req.user?.id || 1,
      },
      trx
    );
    const subscription = await Subscription.create(
      {
        company_id: newCompany.id,
        tier: tier || "basic",
        amount: 0, // Default free tier
        currency: "RWF",
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days trial
      },
      trx
    );
    // Create outbox event within transaction (will be published by dispatcher)
    await companyEvents.created(newCompany, trx);
    await subscriptionEvents.created(subscription, trx);
    return newCompany;
  });

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

  const companies = await Company.findAllCompanies({
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
 * @desc    Get company by ID
 * @route   GET /api/companies/:id
 * @access  Private
 */
const getCompanyById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const company = await Company.findCompanyById(id);

  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

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
  const domain  = req.params.domain;
  console.log(domain)
  const company = await Company.findCompanyByDomain(domain);

  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

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
  const { name, domain, email, phone, country, city } = req.body;

  const company = await Company.findCompanyById(id);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  const updateData = {
    ...(name && { name }),
    ...(domain && { domain }),
    ...(email && { email }),
    ...(phone && { phone }),
    ...(country && { country }),
    ...(city && { city }),
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

  if (!status || !["active", "suspended", "deleted"].includes(status)) {
    res.status(400);
    throw new Error("Invalid status. Must be active, suspended, or deleted");
  }

  const company = await Company.findCompanyById(id);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  // Change status with transaction (atomic with outbox event)
  await db.transaction(async (trx) => {
    await Company.changeCompanyStatus(id, status, req.user?.id || null, trx);

    // Create outbox event within transaction (will be published by dispatcher)
    await companyEvents.statusChanged(id, status, trx);
  });

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

  if (!tier || !["basic", "premium", "enterprise"].includes(tier)) {
    res.status(400);
    throw new Error("Invalid tier. Must be basic, premium, or enterprise");
  }

  const company = await Company.findCompanyById(id);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  // Change tier with transaction (atomic with outbox event)
  await db.transaction(async (trx) => {
    await Company.changeTier(id, tier, req.user?.id || null, trx);

    // Create outbox event within transaction (will be published by dispatcher)
    await companyEvents.tierChanged(id, tier, trx);
  });

  res.json({
    success: true,
    message: `Company tier changed to ${tier}`,
  });
});

/**
 * @desc    Get active companies
 * @route   GET /api/companies/active
 * @access  Private
 */
const getActiveCompanies = asyncHandler(async (req, res) => {
  const companies = await Company.getActiveCompanies();

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

  res.json({
    success: true,
    data: reactivated,
  });
});

module.exports = {
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
};
