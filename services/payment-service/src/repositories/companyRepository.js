// src/repositories/companyRepository.js
// Database operations for company_payment_settings table

const { db } = require('../config/db');

class CompanyRepository {
    /**
     * Upsert company payment settings
     * @param {Object} settings - Company settings data
     * @returns {Promise<Object>} Updated/Created settings
     */
    async upsertCompanySettings(settings) {
        const { company_id, momo_phone, airtel_phone, mpesa_phone, stripe_account_id, company_name, company_email, company_phone, company_address, metadata } = settings;

        const updateData = {
            updated_at: new Date()
        };

        if (momo_phone !== undefined) updateData.momo_phone = momo_phone;
        if (airtel_phone !== undefined) updateData.airtel_phone = airtel_phone;
        if (mpesa_phone !== undefined) updateData.mpesa_phone = mpesa_phone;
        if (stripe_account_id !== undefined) updateData.stripe_account_id = stripe_account_id;

        // Update company details if provided
        if (company_name !== undefined) updateData.company_name = company_name;
        if (company_email !== undefined) updateData.company_email = company_email;
        if (company_phone !== undefined) updateData.company_phone = company_phone;
        if (company_address !== undefined) updateData.company_address = company_address;

        if (metadata) updateData.metadata = db.raw('metadata || ?::jsonb', [JSON.stringify(metadata)]);

        const existing = await db('company_payment_settings')
            .where({ company_id })
            .first();

        if (existing) {
            const [updated] = await db('company_payment_settings')
                .where({ company_id })
                .update(updateData)
                .returning('*');
            return updated;
        } else {
            const [created] = await db('company_payment_settings')
                .insert({
                    company_id,
                    momo_phone,
                    airtel_phone,
                    mpesa_phone,
                    stripe_account_id,
                    company_name,
                    company_email,
                    company_phone,
                    company_address,
                    metadata: metadata || {},
                    created_at: new Date(),
                    updated_at: new Date()
                })
                .returning('*');
            return created;
        }
    }

    /**
     * Get company settings by company_id
     * @param {string} company_id - Company UUID
     * @returns {Promise<Object|null>} Company settings
     */
    async getCompanySettings(company_id) {
        if (!company_id) return null;

        const settings = await db('company_payment_settings')
            .where({ company_id })
            .first();

        return settings || null;
    }

    /**
     * Get all company settings
     * @returns {Promise<Array>} List of all company settings
     */
    async getAllSettings() {
        return await db('company_payment_settings')
            .select('*')
            .orderBy('created_at', 'desc');
    }

    /**
     * Delete company settings
     * @param {string} company_id - Company UUID
     * @returns {Promise<boolean>} Success status
     */
    async deleteCompanySettings(company_id) {
        const deleted = await db('company_payment_settings')
            .where({ company_id })
            .delete();

        return deleted > 0;
    }
}

module.exports = new CompanyRepository();
