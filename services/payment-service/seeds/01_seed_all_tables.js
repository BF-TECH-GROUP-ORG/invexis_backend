/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function (knex) {
  // Deletes ALL existing entries (in reverse dependency order)
  await knex('invoices').del();
  await knex('transactions').del();
  await knex('payments').del();

  // Seed Payments (return payment_id as objects, then extract strings)
  const payments = await knex('payments').insert([
    {
      payment_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',  // Fake UUID
      user_id: '550e8400-e29b-41d4-a716-446655440000',  // Fake user UUID for e-com
      company_id: null,  // NULL for e-com
      order_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',  // Fake order UUID
      amount: 10000,  // $100 in cents
      currency: 'USD',
      description: 'Order #123 - Cart total for 2 items',
      method: 'card',
      gateway: 'stripe',
      gateway_token: 'pm_1234567890',
      status: 'succeeded',
      metadata: '{ "cart_summary": { "item_count": 2, "subtotal": 10000 } }',  // Stringified JSON for JSONB
      ip: '192.168.1.1',
      device_fingerprint: 'dev_fp_abc123',
      location: '{ "country": "US", "city": "New York" }'  // Stringified JSON for JSONB
    },
    {
      payment_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d480',
      user_id: '550e8400-e29b-41d4-a716-446655440001',  // Fake user for tier
      company_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567891',  // Fake company UUID
      order_id: null,  // NULL for tier upgrade
      amount: 5000,  // $50 in cents
      currency: 'XAF',
      description: 'Tier upgrade to company_admin',
      method: 'mobile_money',
      gateway: 'mtn_momo',
      gateway_token: '+237699999999',  // Phone for MoMo
      status: 'pending',
      metadata: '{ "tier": { "from": "basic", "to": "company_admin" } }',  // Stringified JSON
      ip: '192.168.1.2',
      device_fingerprint: 'dev_fp_def456',
      location: '{ "country": "CM", "city": "Yaounde" }'  // Stringified JSON
    },
    {
      payment_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d481',
      user_id: '550e8400-e29b-41d4-a716-446655440002',
      company_id: null,
      order_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567892',
      amount: 7550,  // £75.50 in pence
      currency: 'GBP',
      description: 'Order #456 - Cart total for 3 items',
      method: 'bank_transfer',
      gateway: 'airtel_money',
      gateway_token: 'ref_7890123456',
      status: 'failed',
      failure_reason: 'Insufficient funds',
      metadata: '{ "cart_summary": { "item_count": 3, "subtotal": 7550 } }',  // Stringified JSON
      ip: '192.168.1.3',
      device_fingerprint: 'dev_fp_ghi789',
      location: '{ "country": "GB", "city": "London" }'  // Stringified JSON
    }
  ]).returning('payment_id');  // Returns array of objects like [{ payment_id: 'uuid1' }, ...]

  // Extract UUID strings
  const paymentIds = payments.map(p => p.payment_id);  // ['uuid1', 'uuid2', 'uuid3']

  // Seed Transactions (use paymentIds[0] as UUID string)
  await knex('transactions').insert([
    {
      transaction_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d482',
      payment_id: paymentIds[0],  // Extracted UUID string
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      company_id: null,
      type: 'charge',
      amount: 10000,
      currency: 'USD',
      status: 'succeeded',
      gateway_transaction_id: 'ch_1234567890',
      metadata: '{ "stripe": { "charge_id": "ch_1234567890" } }'  // Stringified JSON
    },
    {
      transaction_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d483',
      payment_id: paymentIds[1],  // Extracted UUID string
      user_id: '550e8400-e29b-41d4-a716-446655440001',
      company_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567891',
      type: 'void',
      amount: -5000,  // Negative for void
      currency: 'XAF',
      status: 'pending',
      gateway_transaction_id: 'txn_momo_123',
      metadata: '{ "mtn_momo": { "transaction_id": "TXN123" } }'  // Stringified JSON
    },
    {
      transaction_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d484',
      payment_id: paymentIds[2],  // Extracted UUID string
      user_id: '550e8400-e29b-41d4-a716-446655440002',
      company_id: null,
      type: 'capture',
      amount: 7550,
      currency: 'GBP',
      status: 'failed',
      gateway_transaction_id: 'ref_airtel_456',
      metadata: '{ "airtel_money": { "reference_id": "REF456" } }'  // Stringified JSON
    }
  ]);

  // Seed Invoices (use paymentIds[0] as UUID string)
  await knex('invoices').insert([
    {
      invoice_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d485',
      payment_id: paymentIds[0],  // Extracted UUID string
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      company_id: null,
      amount_due: 10000,
      currency: 'USD',
      status: 'paid',
      line_items: '[{"product_id": "prod_123", "name": "Blue Shirt", "quantity": 1, "unit_price": 5000, "total": 5000}, {"product_id": "prod_456", "name": "Pants", "quantity": 1, "unit_price": 5000, "total": 5000}]',  // Stringified array
      pdf_url: 'https://example.com/invoice_001.pdf',
      metadata: '{ "tax": 0, "discount": 0 }'  // Stringified JSON
    },
    {
      invoice_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d486',
      payment_id: paymentIds[1],  // Extracted UUID string
      user_id: '550e8400-e29b-41d4-a716-446655440001',
      company_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567891',
      amount_due: 5000,
      currency: 'XAF',
      status: 'open',
      line_items: '[{"product_id": "tier_company_admin", "name": "Tier Upgrade: Company Admin", "quantity": 1, "unit_price": 5000, "total": 5000}]',  // Stringified array
      pdf_url: null,  // Pending
      metadata: '{ "tier": { "level": "company_admin" } }'  // Stringified JSON
    },
    {
      invoice_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d487',
      payment_id: paymentIds[2],  // Extracted UUID string
      user_id: '550e8400-e29b-41d4-a716-446655440002',
      company_id: null,
      amount_due: 7550,
      currency: 'GBP',
      status: 'void',
      line_items: '[{"product_id": "prod_789", "name": "Shoes", "quantity": 2, "unit_price": 3000, "total": 6000}, {"product_id": "prod_012", "name": "Hat", "quantity": 1, "unit_price": 1550, "total": 1550}]',  // Stringified array
      pdf_url: null,  // Failed
      metadata: '{ "tax": 0, "discount": 0 }'  // Stringified JSON
    }
  ]);
};