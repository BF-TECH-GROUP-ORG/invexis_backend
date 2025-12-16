const asyncHandler = require('express-async-handler');
const Company = require('../models/company.model');
const db = require('../config');
const axios = require('axios');

/**
 * @desc    Assign or replace company admin
 * @route   POST /api/company-admins/company/:companyId
 * @access  Private (Super Admin only)
 * @body    { user_id }
 */
const assignCompanyAdmin = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const { user_id } = req.body;

    // Validate required fields
    if (!user_id) {
        res.status(400);
        throw new Error('User ID is required');
    }

    if (typeof user_id !== 'string') {
        res.status(400);
        throw new Error('User ID must be a valid string');
    }

    // Verify company exists
    const company = await Company.findCompanyById(companyId);
    if (!company) {
        res.status(404);
        throw new Error('Company not found');
    }

    // Verify user exists in Auth Service (call to Auth Service to validate)
    try {
        const authResponse = await axios.get(
            `${process.env.AUTH_SERVICE_URL || 'http://auth-service:8001'}/users/${user_id}`
        );
        if (!authResponse.data?.data) {
            res.status(404);
            throw new Error('User not found in Auth Service');
        }
    } catch (error) {
        res.status(400);
        throw new Error(`Cannot verify user: ${error.message}`);
    }

    // Update company with new admin
    const updated = await Company.updateCompany(companyId, {
        company_admin_id: user_id,
        updatedBy: req.user?.id || null,
        updatedAt: new Date(),
    });

    res.json({
        success: true,
        message: 'Company admin assigned successfully',
        data: updated,
    });
});

/**
 * @desc    Get current company admin
 * @route   GET /api/company-admins/company/:companyId
 * @access  Private
 */
const getCompanyAdmin = asyncHandler(async (req, res) => {
    const { companyId } = req.params;

    // Verify company exists
    const company = await Company.findCompanyById(companyId);
    if (!company) {
        res.status(404);
        throw new Error('Company not found');
    }

    if (!company.company_admin_id) {
        res.status(404);
        throw new Error('No company admin assigned for this company');
    }

    // Get admin user details from Auth Service
    try {
        const authResponse = await axios.get(
            `${process.env.AUTH_SERVICE_URL || 'http://auth-service:8001'}/users/${company.company_admin_id}`
        );

        res.json({
            success: true,
            data: {
                company_id: companyId,
                admin_user_id: company.company_admin_id,
                admin_details: authResponse.data?.data,
            },
        });
    } catch (error) {
        res.status(400);
        throw new Error(`Cannot fetch admin details: ${error.message}`);
    }
});

/**
 * @desc    Get all users belonging to a company (from Auth Service)
 * @route   GET /api/company-admins/company/:companyId/users
 * @access  Private
 */
const getCompanyUsers = asyncHandler(async (req, res) => {
    const { companyId } = req.params;

    // Verify company exists
    const company = await Company.findCompanyById(companyId);
    if (!company) {
        res.status(404);
        throw new Error('Company not found');
    }

    try {
        // Fetch all users belonging to this company from Auth Service
        const authResponse = await axios.get(
            `${process.env.AUTH_SERVICE_URL || 'http://auth-service:8001'}/users/company/${companyId}`,
            {
                params: {
                    includeCompanies: true,
                    limit: 1000, // Adjust as needed
                },
            }
        );

        const users = authResponse.data?.data || [];

        res.json({
            success: true,
            count: users.length,
            data: users.map(user => ({
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                role: user.role,
                companies: user.companies || [],
                assignedDepartments: user.assignedDepartments || [],
                employmentStatus: user.employmentStatus,
            })),
        });
    } catch (error) {
        res.status(400);
        throw new Error(`Cannot fetch company users: ${error.message}`);
    }
});

/**
 * @desc    Remove company admin (set to null)
 * @route   DELETE /api/company-admins/company/:companyId
 * @access  Private (Super Admin only)
 */
const removeCompanyAdmin = asyncHandler(async (req, res) => {
    const { companyId } = req.params;

    // Verify company exists
    const company = await Company.findCompanyById(companyId);
    if (!company) {
        res.status(404);
        throw new Error('Company not found');
    }

    if (!company.company_admin_id) {
        res.status(400);
        throw new Error('No company admin currently assigned');
    }

    // Remove admin
    const updated = await Company.updateCompany(companyId, {
        company_admin_id: null,
        updatedBy: req.user?.id || null,
        updatedAt: new Date(),
    });

    res.json({
        success: true,
        message: 'Company admin removed successfully',
        data: updated,
    });
});

/**
 * @desc    Get companies administered by a user
 * @route   GET /api/company-admins/user/:userId
 * @access  Private
 */
const getAdministeredCompanies = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    // Find all companies where this user is the admin
    const companies = await db('companies')
        .where('company_admin_id', userId)
        .andWhere('is_deleted', false)
        .select('*');

    res.json({
        success: true,
        count: companies.length,
        data: companies,
    });
});

module.exports = {
    assignCompanyAdmin,
    getCompanyAdmin,
    getCompanyUsers,
    removeCompanyAdmin,
    getAdministeredCompanies,
};
