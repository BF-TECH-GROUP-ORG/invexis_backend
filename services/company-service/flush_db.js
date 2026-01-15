const knexConfig = require('./knexfile');
const config = { ...knexConfig.development };
config.connection.host = '127.0.0.1'; // Override for local execution

const knex = require('knex')(config);

async function flush() {
    console.log('🌊 Flushing database tables for company_service...');

    // Order matters for foreign keys - drop child tables first
    const tables = [
        'event_outbox',
        'company_departments',
        'department_users',
        'subscriptions',
        'company_role_assignments',
        'company_roles',
        'users_replica',
        'users_replication',
        'companies',
        'knex_migrations',
        'knex_migrations_lock'
    ];

    for (const table of tables) {
        try {
            // Use raw cascade drop if possible to be extra sure
            await knex.schema.raw(`DROP TABLE IF EXISTS "${table}" CASCADE`);
            console.log(`  ✓ Dropped ${table} (cascade)`);
        } catch (e) {
            console.warn(`  ! Could not drop ${table}: ${e.message}`);
        }
    }

    console.log('✅ Database flush complete.');
    await knex.destroy();
    process.exit(0);
}

flush().catch(err => {
    console.error('❌ Flush failed:', err);
    process.exit(1);
});
