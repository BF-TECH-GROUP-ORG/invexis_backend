// src/utils/constants.js
// Centralized constants for payment service

const GATEWAY_TYPES = {
    // STRIPE: 'stripe',
    MTN_MOMO: 'mtn_momo',
    AIRTEL_MONEY: 'airtel_money',
    // MPESA: 'mpesa',
    CASH: 'cash',
    MANUAL: 'manual' // For bank transfers
};

const PAYMENT_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    SUCCEEDED: 'succeeded',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
};

const TRANSACTION_TYPE = {
    CHARGE: 'charge',
    VOID: 'void',
    CAPTURE: 'capture',
    DISPUTE: 'dispute'
};

const TRANSACTION_STATUS = {
    PENDING: 'pending',
    SUCCEEDED: 'succeeded',
    FAILED: 'failed'
};

const PAYMENT_METHOD = {
    CARD: 'card',
    MOBILE_MONEY: 'mobile_money',
    BANK_TRANSFER: 'bank_transfer'
};

const INVOICE_STATUS = {
    DRAFT: 'draft',
    OPEN: 'open',
    PAID: 'paid',
    VOID: 'void'
};

const CURRENCY = {
    RWF: 'RWF'  // Rwandan Francs (primary currency)
};

const PAYMENT_TYPE = {
    SALE: 'SALE',
    DEBT: 'DEBT',
    TIER: 'TIER',
    SUBSCRIPTION: 'SUBSCRIPTION',
    ECOMM: 'ECOMM'
};

module.exports = {
    GATEWAY_TYPES,
    PAYMENT_STATUS,
    TRANSACTION_TYPE,
    TRANSACTION_STATUS,
    PAYMENT_METHOD,
    PAYMENT_TYPE,
    INVOICE_STATUS,
    CURRENCY
};
