const asyncHandler = require("express-async-handler");
const Company = require("../models/company.model");
const Subscription = require("../models/subscription.model");
const { subscriptionEvents } = require("../events/eventHelpers");
const { companyEvents } = require("../events/eventHelpers");
const db = require("../config");
const { VALID_TIERS, normalizeTier } = require("../constants/tiers");

/**
 * @desc    Create a new company
 * @route   POST /api/companies
 * @access  Private (Super Admin)
 */
const createCompany = asyncHandler(async (req, res) => {
  const { name, domain, email, phone, country, city, tier, coordinates, category_ids } =
    req.body;

  // Validate required fields
  if (!name) {
    res.status(400);
    throw new Error("Company name is required");
  }

  // Validate tier if provided
  if (tier) {
    const normalizedTier = normalizeTier(tier);
    if (!normalizedTier) {
      res.status(400);
      throw new Error(`Invalid tier. Must be one of: ${VALID_TIERS.join(", ")}`);
    }
  }

  // Validate category_ids if provided
  if (category_ids && !Array.isArray(category_ids)) {
    res.status(400);
    throw new Error("category_ids must be an array");
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
        category_ids: category_ids || [],
        createdBy: req.user?.id || "651f2c80c6b9b5a7cdfe1909",
      },
      trx
    );
    const subscription = await Subscription.create(
      {
        company_id: newCompany.id,
        tier: normalizeTier(tier) || "Basic",
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
  const { name, domain, email, phone, country, city, category_ids } = req.body;

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

  const updateData = {
    ...(name && { name }),
    ...(domain && { domain }),
    ...(email && { email }),
    ...(phone && { phone }),
    ...(country && { country }),
    ...(city && { city }),
    ...(category_ids !== undefined && { category_ids }),
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
  const { id } = req.params;
  const { documents } = req.body;

  if (!documents || !Array.isArray(documents) || documents.length === 0) {
    res.status(400);
    throw new Error("documents must be a non-empty array");
  }

  const company = await Company.findCompanyById(id);
  if (!company) {
    res.status(404);
    throw new Error("Company not found");
  }

  const userId = req.user?.id || null;

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

  const newDocs = documents.map((doc, index) => ({
    id: doc.id || `doc_${Date.now()}_${index}`,
    type: doc.type || null,
    name: doc.name || null,
    url: doc.url || null,
    notes: doc.notes || null,
    uploadedAt: doc.uploadedAt || nowIso,
    uploadedBy: doc.uploadedBy || userId,
  }));

  metadata.verification = {
    ...existingVerification,
    status: "pending",
    documents: [...existingDocs, ...newDocs],
  };

  const updatedCompany = await db.transaction(async (trx) => {
    await trx("companies")
      .where({ id })
      .update({
        metadata,
        updatedBy: userId,
        updatedAt: new Date(),
      });

    const fresh = await trx("companies").where({ id }).first();

    await companyEvents.updated(fresh, trx);

    return fresh;
  });

  res.json({
    success: true,
    message: "Verification documents uploaded successfully",
    data: updatedCompany,
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

  res.json({
    success: true,
    message:
      decision === "approved"
        ? "Company verification approved and company activated"
        : "Company verification rejected",
    data: updatedCompany,
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
  getCompaniesByCategories,
  addCompanyCategories,
  removeCompanyCategories,
  setCompanyCategories,
  uploadCompanyVerificationDocs,
  reviewCompanyVerification,
};
