/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('payments').del()
  await knex('payments').insert([
    { id: 1, user_id: '1', amount: 100.00, payment_method: 'credit_card', company: 'Company A', currency: 'USD', status: 'completed' },
    { id: 2, user_id: '2', amount: 50.00, payment_method: 'paypal', company: 'Company B', currency: 'EUR', status: 'pending' },
    { id: 3, user_id: '3', amount: 75.50, payment_method: 'bank_transfer', company: 'Company C', currency: 'GBP', status: 'failed' }
  ]);
};
