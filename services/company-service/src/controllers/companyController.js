const asyncHandler = require("express-async-handler");
const Company = require("../models/company.model");
const Subscription = require("../models/subscription.model");
const Department = require("../models/department.model");
const { subscriptionEvents } = require("../events/eventHelpers");
const { companyEvents } = require("../events/eventHelpers");
const db = require("../config");
const { VALID_TIERS, normalizeTier } = require("../constants/tiers");
const { getCache, setCache, delCache } = require('../utils/redisHelper');
const { DEPARTMENTS, DEPARTMENT_NAMES, DEPARTMENT_DESCRIPTIONS } = require("../constants/departments");

/**
 * @desc    Create a new company
 * @route   POST /api/companies
 * @access  Private (Super Admin)
 */
const createCompany = asyncHandler(async (req, res) => {
  const { name, domain, email, phone, country, city, tier, coordinates, category_ids, company_admin_id } =
    req.body;

  // Validate required fields
  if (!name) {
    res.status(400);
    throw new Error("Company name is required");
  }

  // Validate company_admin_id if provided
  if (company_admin_id && typeof company_admin_id !== 'string') {
    res.status(400);
    throw new Error("company_admin_id must be a valid user ID");
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
        company_admin_id: company_admin_id || null, // Set company admin if provided
        createdBy: req.user?.id || "651f2c80c6b9b5a7cdfe1909",
      },
      trx
    );

    // ✅ Auto-create fixed departments for new company
    for (const deptType of Object.values(DEPARTMENTS)) {
      await db(Department.table).insert({
        id: require("uuid").v4(),
        company_id: newCompany.id,
        name: deptType,
        display_name: DEPARTMENT_NAMES[deptType],
        description: DEPARTMENT_DESCRIPTIONS[deptType],
        status: "active",
        createdBy: req.user?.id || "651f2c80c6b9b5a7cdfe1909",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

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
  
  // Create cache key from query parameters
  const cacheKey = `companies:${status || 'all'}:${tier || 'all'}:${limit}:${offset}`;
  
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
  setCache(cacheKey, companies, 600).catch(() => {});

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

  // Try cache first
  const cacheKey = `company:${id}`;
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
  setCache(cacheKey, company, 3600).catch(() => {});

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
  setCache(cacheKey, company, 3600).catch(() => {});

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

  // Invalidate caches (fire-and-forget)
  delCache(`company:${id}`).catch(() => {});
  delCache('companies:active').catch(() => {});
  delCache(`company:domain:${updatedCompany.domain}`).catch(() => {});

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
  delCache(`company:${id}`).catch(() => {});
  delCache('companies:active').catch(() => {});
  delCache(`company:domain:${company.domain}`).catch(() => {});

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
  delCache(`company:${id}`).catch(() => {});
  delCache('companies:active').catch(() => {});
  delCache(`company:domain:${company.domain}`).catch(() => {});

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
  delCache(`company:${id}`).catch(() => {});
  delCache('companies:active').catch(() => {});

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
  const cacheKey = 'companies:active';
  
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
  setCache(cacheKey, companies, 300).catch(() => {});

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
  delCache(`company:${id}`).catch(() => {});
  delCache('companies:active').catch(() => {});
  delCache(`company:domain:${reactivated.domain}`).catch(() => {});

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
    setCache(cacheKey, company, 3600).catch(() => {});
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

  // Build new documents array (fast, in-memory)
  const newDocs = req.files.map((file, index) => {
    const docTypeField = `documentType_${index}`;
    const docNotesField = `documentNotes_${index}`;
    return {
      id: `doc_${ts}_${index}`,
      type: req.body[docTypeField] || file.mimetype,
      name: file.originalname,
      url: file.path,
      cloudinary_public_id: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      format: file.format,
      resource_type: file.resource_type,
      notes: req.body[docNotesField] || null,
      uploadedAt: nowIso,
      uploadedBy: userId,
    };
  });

  // Update metadata (batch) and persist with a single fast DB call
  metadata.verification = {
    ...existingVerification,
    status: "pending",
    documents: [...existingDocs, ...newDocs],
  };

  // Perform a minimal, single UPDATE (no heavy transactions) for speed
  await db("companies").where({ id }).update({
    metadata,
    updatedBy: userId,
    updatedAt: new Date(),
  });

  // Refresh company (read-after-write) from DB for response
  const updatedCompany = await Company.findCompanyById(id);

  // Fire-and-forget: publish an event to RabbitMQ so background workers can
  // process any heavier work (audit, outbox creation, notifications)
  (async () => {
    try {
      let rabbitmq;
      try {
        rabbitmq = require('/app/shared/rabbitmq.js');
      } catch (err) {
        try {
          rabbitmq = require('/app/shared/rabbitmq.js');
        } catch (err2) {
          rabbitmq = null;
        }
      }

      if (rabbitmq) {
        rabbitmq.publish({
          exchange: 'events_topic',
          routingKey: 'company.verification_docs.uploaded',
          content: {
            type: 'company.verification_docs.uploaded',
            data: {
              companyId: id,
              uploadedBy: userId,
              uploadedAt: nowIso,
              uploadedCount: newDocs.length,
              docs: newDocs.map(d => ({ id: d.id, cloudinary_public_id: d.cloudinary_public_id, url: d.url }))
            }
          }
        }).catch(e => console.warn('Publish failed (non-blocking):', e && e.message));
      }
    } catch (err) {
      console.warn('Async publish error:', err && err.message);
    }
  })();

  // Invalidate cache asynchronously
  delCache(cacheKey).catch(() => {});

  // Respond quickly with updated company and uploaded file metadata
  res.json({
    success: true,
    message: "Verification documents uploaded successfully",
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
