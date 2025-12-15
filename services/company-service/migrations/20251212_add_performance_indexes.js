/**
 * Add performance indexes for frequently queried columns
 * This migration adds indexes to improve query performance significantly
 */

exports.up = async function (knex) {
  try {
    console.log('Creating performance indexes...');
    
    // Helper to check if table exists
    const tableExists = async (tableName) => {
      const result = await knex.schema.raw(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ?)`,
        [tableName]
      );
      return result.rows[0].exists;
    };

    // Companies table indexes
    if (await tableExists('companies')) {
      try {
        await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status)`);
      } catch (e) {
        console.warn('Index idx_companies_status:', e.message);
      }
      
      try {
        await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_companies_tier ON companies(tier)`);
      } catch (e) {
        console.warn('Index idx_companies_tier:', e.message);
      }
      
      try {
        await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_companies_status_tier ON companies(status, tier)`);
      } catch (e) {
        console.warn('Index idx_companies_status_tier:', e.message);
      }
      
      try {
        await knex.schema.raw(`CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_domain_unique ON companies(domain) WHERE domain IS NOT NULL`);
      } catch (e) {
        console.warn('Index idx_companies_domain_unique:', e.message);
      }
      
      try {
        await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name)`);
      } catch (e) {
        console.warn('Index idx_companies_name:', e.message);
      }
      
      try {
        await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_companies_company_admin_id ON companies(company_admin_id) WHERE company_admin_id IS NOT NULL`);
      } catch (e) {
        console.warn('Index idx_companies_company_admin_id:', e.message);
      }
      
      console.log('✓ Created indexes on companies table');
    } else {
      console.log('⊘ Skipped companies indexes (table does not exist)');
    }

    // Department indexes
    if (await tableExists('company_departments')) {
      try {
        await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_departments_company_id ON company_departments(company_id)`);
      } catch (e) {
        console.warn('Index idx_departments_company_id:', e.message);
      }
      
      try {
        await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_departments_status_company ON company_departments(status, company_id)`);
      } catch (e) {
        console.warn('Index idx_departments_status_company:', e.message);
      }
      
      console.log('✓ Created indexes on company_departments table');
    } else {
      console.log('⊘ Skipped company_departments indexes (table does not exist)');
    }

    // Subscription indexes
    if (await tableExists('subscriptions')) {
      try {
        await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_subscriptions_company_id ON subscriptions(company_id)`);
      } catch (e) {
        console.warn('Index idx_subscriptions_company_id:', e.message);
      }
      
      try {
        await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_subscriptions_is_active ON subscriptions(is_active)`);
      } catch (e) {
        console.warn('Index idx_subscriptions_is_active:', e.message);
      }
      
      try {
        await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_subscriptions_company_active ON subscriptions(company_id, is_active)`);
      } catch (e) {
        console.warn('Index idx_subscriptions_company_active:', e.message);
      }
      
      console.log('✓ Created indexes on subscriptions table');
    } else {
      console.log('⊘ Skipped subscriptions indexes (table does not exist)');
    }

    // Outbox indexes
    if (await tableExists('outbox')) {
      try {
        await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_outbox_published ON outbox(published)`);
      } catch (e) {
        console.warn('Index idx_outbox_published:', e.message);
      }
      
      console.log('✓ Created indexes on outbox table');
    } else {
      console.log('⊘ Skipped outbox indexes (table does not exist)');
    }

    console.log('✓ Performance indexes migration completed successfully');
  } catch (err) {
    console.error('Error in migration:', err);
    throw err;
  }
};

exports.down = async function (knex) {
  try {
    // Drop all custom indexes
    const indexes = [
      'idx_companies_status',
      'idx_companies_tier',
      'idx_companies_domain_unique',
      'idx_companies_name',
      'idx_companies_company_admin_id',
      'idx_companies_status_tier',
      'idx_departments_company_id',
      'idx_departments_status_company',
      'idx_subscriptions_company_id',
      'idx_subscriptions_is_active',
      'idx_subscriptions_company_active',
      'idx_outbox_published',
    ];

    for (const indexName of indexes) {
      try {
        await knex.schema.raw(`DROP INDEX IF EXISTS ${indexName}`);
      } catch (e) {
        console.warn(`Could not drop index ${indexName}:`, e.message);
      }
    }
    
    console.log('✓ All performance indexes dropped');
  } catch (err) {
    console.error('Error dropping indexes:', err);
    throw err;
  }
};

exports.down = async function (knex) {
  // Drop all custom indexes
  const tables = ['companies', 'company_departments', 'subscriptions', 'outbox'];
  
  for (const table of tables) {
    try {
      const indexes = [
        `idx_${table === 'company_departments' ? 'departments' : table.split('_')[0]}_*`
      ];
      
      if (table === 'companies') {
        await knex.schema.alterTable(table, t => {
          t.dropIndex([], 'idx_companies_status');
          t.dropIndex([], 'idx_companies_tier');
          t.dropIndex([], 'idx_companies_domain_unique');
          t.dropIndex([], 'idx_companies_name');
          t.dropIndex([], 'idx_companies_company_admin_id');
          t.dropIndex([], 'idx_companies_status_tier');
        });
      } else if (table === 'company_departments') {
        await knex.schema.alterTable(table, t => {
          t.dropIndex([], 'idx_departments_company_id');
          t.dropIndex([], 'idx_departments_status_company');
        });
      } else if (table === 'subscriptions') {
        await knex.schema.alterTable(table, t => {
          t.dropIndex([], 'idx_subscriptions_company_id');
          t.dropIndex([], 'idx_subscriptions_is_active');
          t.dropIndex([], 'idx_subscriptions_company_active');
        });
      } else if (table === 'outbox') {
        await knex.schema.alterTable(table, t => {
          t.dropIndex([], 'idx_outbox_published');
          t.dropIndex([], 'idx_outbox_publish_check');
        });
      }
    } catch (err) {
      console.warn(`Could not drop indexes for ${table}:`, err.message);
    }
  }
};
