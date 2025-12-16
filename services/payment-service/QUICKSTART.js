// Quick Start Guide for Invexis Payment Service
// ================================================

// 1. SETUP
// --------
// Install dependencies:
// npm install

// Configure .env file with your credentials:
// - Database: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
// - Stripe: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
// - MTN MoMo: MTN_SUBSCRIPTION_KEY, MTN_USER, MTN_API_KEY
// - Airtel: AIRTEL_MONEY_API_KEY, AIRTEL_MONEY_API_SECRET
// - M-Pesa: MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE

// Run migrations:
// npm run migrate:latest

// Start service:
// npm run dev


// 2. EXAMPLE API CALLS
// ---------------------

// Initiate Stripe Payment
const stripePayment = {
    user_id: "550e8400-e29b-41d4-a716-446655440000",
    seller_id: "660e8400-e29b-41d4-a716-446655440000",
    amount: 5000,
    currency: "USD",
    description: "Product purchase",
    paymentMethod: "card",
    gateway: "stripe",
    customerEmail: "customer@example.com",
    lineItems: [
        {
            name: "Premium Subscription",
            quantity: 1,
            unit_price: 5000,
            total: 5000
        }
    ]
};

// POST http://localhost:8009/payment/initiate
// Body: stripePayment

// Initiate MTN MoMo Payment
const mtnPayment = {
    user_id: "550e8400-e29b-41d4-a716-446655440000",
    seller_id: "660e8400-e29b-41d4-a716-446655440000",
    amount: 10000,
    currency: "EUR",
    description: "Product purchase",
    paymentMethod: "mobile_money",
    gateway: "mtn_momo",
    phoneNumber: "46733123450"
};

// POST http://localhost:8009/payment/initiate
// Body: mtnPayment

// Check Payment Status
// GET http://localhost:8009/payment/status/{payment_id}

// Get User Payments
// GET http://localhost:8009/payment/user/{user_id}?limit=50&status=succeeded

// Get Seller Payments
// GET http://localhost:8009/payment/seller/{seller_id}?limit=50

// Download Invoice PDF
// GET http://localhost:8009/payment/invoices/{invoice_id}/pdf

// Get Payment Statistics
// GET http://localhost:8009/payment/reports/stats?seller_id={seller_id}

// Get Gateway Performance
// GET http://localhost:8009/payment/reports/gateway-performance


// 3. TESTING WITH CURL
// ---------------------

/*
# Health Check
curl http://localhost:8009/health

# Initiate Payment
curl -X POST http://localhost:8009/payment/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "seller_id": "660e8400-e29b-41d4-a716-446655440000",
    "amount": 5000,
    "currency": "USD",
    "description": "Test payment",
    "paymentMethod": "card",
    "gateway": "stripe",
    "customerEmail": "test@example.com"
  }'

# Check Status
curl http://localhost:8009/payment/status/PAYMENT_ID

# Get Reports
curl http://localhost:8009/payment/reports/stats
*/


// 4. GATEWAY-SPECIFIC NOTES
// --------------------------

// STRIPE
// - Uses Payment Intents API
// - Returns client_secret for frontend confirmation
// - Webhook signature verification required

// MTN MOMO
// - Sandbox: https://sandbox.momodeveloper.mtn.com
// - Phone format: No + sign, just digits
// - Currency: EUR for sandbox

// AIRTEL MONEY
// - OAuth 2.0 authentication
// - Country-specific configurations
// - Currency: UGX for Uganda

// M-PESA
// - STK Push (Lipa Na M-Pesa)
// - Requires MPESA_PASSKEY for password generation
// - Callback URL must be publicly accessible


// 5. DATABASE COMMANDS
// ---------------------

// Run migrations
// npm run migrate:latest

// Rollback last migration
// npm run migrate:rollback

// Check migration status
// npm run migrate:status

// Connect to database (if using Docker)
// docker exec -it payment-postgres psql -U invexis -d paymentdb


// 6. TROUBLESHOOTING
// -------------------

// Database connection error:
// - Check DB_HOST in .env (use 'localhost' if not using Docker)
// - Ensure PostgreSQL is running
// - Verify credentials

// Gateway API errors:
// - Verify API keys in .env
// - Check you're using sandbox/test mode
// - Review gateway documentation

// Webhook not receiving:
// - Use ngrok for local testing: ngrok http 8009
// - Configure webhook URL in gateway dashboard
// - Check webhook signature secrets


// 7. PRODUCTION CHECKLIST
// ------------------------

// [ ] Update all API keys to production values
// [ ] Set JWT_SECRET to strong random value
// [ ] Configure production database
// [ ] Set up SSL/TLS
// [ ] Configure webhook URLs
// [ ] Set up monitoring and logging
// [ ] Enable rate limiting
// [ ] Configure CORS_ORIGIN
// [ ] Set up automated backups
// [ ] Test all payment flows
// [ ] Set up alerting for failed payments
