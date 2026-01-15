#!/usr/bin/env node
/**
 * Populate Redis subscription cache for all companies
 * 
 * This script fetches all companies from the company-service and populates
 * the Redis cache with their subscription data. Useful for:
 * - Initial cache population
 * - Cache recovery after Redis restart
 * - Fixing missing cache entries
 * 
 * Usage: node populate-subscription-cache.js
 */

require('dotenv').config();
const axios = require('axios');
const redis = require('/app/shared/redis');

const COMPANY_SERVICE_URL = process.env.COMPANY_SERVICE_URL || 'http://company-service:8002';

async function populateCache() {
    try {
        console.log('🔄 Connecting to Redis...');
        await redis.connect();
        console.log('✅ Redis connected');

        console.log('🔄 Fetching companies from company-service...');
        const response = await axios.get(`${COMPANY_SERVICE_URL}/api/companies`, {
            params: { limit: 1000 },
            timeout: 30000
        });

        const companies = response.data.data || [];
        console.log(`📊 Found ${companies.length} companies`);

        let populated = 0;
        let skipped = 0;
        let errors = 0;

        for (const company of companies) {
            try {
                const { id, status, tier, subscription } = company;

                if (!subscription) {
                    console.log(`⚠️  Skipping company ${id} (${company.name}): No subscription data`);
                    skipped++;
                    continue;
                }

                const cacheKey = `company:subscription:${id}`;
                const cacheData = {
                    is_active: subscription.is_active,
                    tier: subscription.tier || tier,
                    end_date: subscription.end_date,
                    company_status: status,
                    last_updated: new Date().toISOString()
                };

                await redis.client.set(
                    cacheKey,
                    JSON.stringify(cacheData),
                    'EX',
                    604800 // 7 days
                );

                console.log(`✅ Populated cache for ${company.name} (${id})`);
                populated++;
            } catch (err) {
                console.error(`❌ Error processing company ${company.id}:`, err.message);
                errors++;
            }
        }

        console.log('\n📊 Summary:');
        console.log(`  ✅ Populated: ${populated}`);
        console.log(`  ⚠️  Skipped: ${skipped}`);
        console.log(`  ❌ Errors: ${errors}`);
        console.log(`  📦 Total: ${companies.length}`);

        await redis.close();
        console.log('\n✅ Done!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Fatal error:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

populateCache();
