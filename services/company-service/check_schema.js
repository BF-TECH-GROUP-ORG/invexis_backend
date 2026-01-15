const knex = require('knex');
const config = require('./knexfile');

async function checkSchema() {
    const db = knex(config.development);
    try {
        const columns = await db('information_schema.columns')
            .select('column_name', 'data_type')
            .where({ table_name: 'companies' });
        console.log(JSON.stringify(columns, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await db.destroy();
    }
}

checkSchema();
