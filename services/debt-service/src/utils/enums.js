const DebtStatus = Object.freeze({ UNPAID: 'UNPAID', PARTIALLY_PAID: 'PARTIALLY_PAID', PAID: 'PAID' });
const PaymentMethod = Object.freeze({ CASH: 'CASH', CARD: 'CARD', MOBILE_MONEY: 'MOBILE_MONEY', BANK_TRANSFER: 'BANK_TRANSFER', OTHER: 'OTHER' });
const RiskRating = Object.freeze({ GOOD: 'GOOD', LATE_PAYER: 'LATE_PAYER', HIGH_RISK: 'HIGH_RISK' });

module.exports = { DebtStatus, PaymentMethod, RiskRating };
