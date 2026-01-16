// src/config/smsTemplates.js
// Simple SMS template registry with direct string substitution
// No Handlebars, no database, just simple and efficient

/**
 * SMS Template Registry
 * 
 * Each template is a function that receives payload and returns SMS message string
 * This approach is:
 * - Simple: No complex compilation or Handlebars
 * - Fast: Direct function calls, no parsing
 * - Flexible: Full JavaScript power for formatting
 * - Type-safe: Can add JSDoc for better IDE support
 * - Testable: Easy to unit test individual templates
 */

const smsTemplates = {
    /**
     * Welcome message when user signs up
     * @param {object} payload
     * @param {string} payload.userName - User's name
     * @param {string} payload.companyName - Company name
     * @param {string} payload.actionUrl - Verification URL
     * @param {string} payload.supportEmail - Support email
     */
    welcome: (payload) => {
        const { userName, companyName, actionUrl, supportEmail } = payload;
        return `Welcome to ${companyName}, ${userName}! Verify: ${actionUrl} - Need help? ${supportEmail}`;
    },

    /**
     * Order status update notification
     * @param {object} payload
     * @param {string} payload.orderId - Order ID
     * @param {string} payload.status - Order status
     * @param {string} payload.orderTotal - Total amount
     * @param {string} payload.actionUrl - Order details URL
     */
    order_update: (payload) => {
        const { orderId, status, orderTotal, actionUrl } = payload;
        return `Order ${orderId}: ${status}. Total ${orderTotal}. Details: ${actionUrl}`;
    },

    /**
     * Order confirmation notification
     * @param {object} payload
     * @param {string} payload.orderId - Order ID
     * @param {string} payload.orderTotal - Total amount
     * @param {string} payload.userName - Customer name
     */
    order_notification: (payload) => {
        const { orderId, orderTotal, userName } = payload;
        return `Hi ${userName}, Order ${orderId} confirmed! Total: ${orderTotal}. Thank you!`;
    },

    /**
     * Sale created notification
     * @param {object} payload
     * @param {string} payload.saleId - Sale ID
     * @param {string} payload.amount - Sale amount
     * @param {string} payload.companyName - Company name
     */
    "sale.created": (payload) => {
        const { saleId, amount, companyName } = payload;
        return `Sale #${saleId} confirmed! Amount: ${amount}. Thanks for your business! - ${companyName}`;
    },

    /**
     * Low stock alert
     * @param {object} payload
     * @param {string} payload.productName - Product name
     * @param {number} payload.currentStock - Current stock level
     * @param {number} payload.threshold - Minimum stock threshold
     */
    low_stock_alert: (payload) => {
        const { productName, currentStock, threshold } = payload;
        return `⚠️ Low stock alert: ${productName} - Only ${currentStock} left (min: ${threshold})`;
    },

    /**
     * Product out of stock
     * @param {object} payload
     * @param {string} payload.productName - Product name
     * @param {string} payload.productId - Product ID
     */
    out_of_stock: (payload) => {
        const { productName, productId } = payload;
        return `⚠️ OUT OF STOCK: ${productName} (ID: ${productId}). Please restock immediately.`;
    },

    /**
     * Payment received confirmation
     * @param {object} payload
     * @param {string} payload.amount - Payment amount
     * @param {string} payload.invoiceId - Invoice ID
     * @param {string} payload.customerName - Customer name
     */
    payment_received: (payload) => {
        const { amount, invoiceId, customerName } = payload;
        return `Payment received: ${amount} for invoice ${invoiceId}. Thank you, ${customerName}!`;
    },

    /**
     * Payment reminder
     * @param {object} payload
     * @param {string} payload.amount - Amount due
     * @param {string} payload.invoiceId - Invoice ID
     * @param {string} payload.dueDate - Due date
     */
    payment_reminder: (payload) => {
        const { amount, invoiceId, dueDate } = payload;
        return `Payment reminder: ${amount} due for invoice ${invoiceId} by ${dueDate}. Please pay soon.`;
    },

    /**
     * Debt status update
     * @param {object} payload
     * @param {string} payload.debtId - Debt ID
     * @param {string} payload.status - New status
     * @param {string} payload.amount - Debt amount
     */
    "debt.status.updated": (payload) => {
        const { debtId, status, amount } = payload;
        return `Debt ${debtId} status updated to: ${status}. Amount: ${amount}`;
    },

    /**
     * Debt created notification for customer
     * @param {object} payload
     * @param {string} payload.debtId - Debt ID
     * @param {string} payload.amount - Debt amount
     * @param {string} payload.totalDebt - Total debt amount
     * @param {string} payload.dueDate - Due date
     * @param {string} payload.companyName - Company name
     */
    "debt.created": (payload) => {
        const { debtId, amount, totalAmount, totalDebt, dueDate, companyName } = payload;
        const debtAmount = amount || totalAmount || totalDebt || '0 RWF';
        return `${companyName}: Debt #${debtId} recorded for ${debtAmount}. Due: ${dueDate}. Contact us to settle.`;
    },

    /**
     * Debt repayment received notification
     * @param {object} payload
     * @param {string} payload.debtId - Debt ID
     * @param {string} payload.amountPaid - Amount paid
     * @param {string} payload.remainingBalance - Remaining balance
     * @param {string} payload.companyName - Company name
     */
    "debt.payment.received": (payload) => {
        const { debtId, amount, remainingBalance, companyName } = payload;
        const paid = amount || '0 RWF';
        const balance = remainingBalance || '0 RWF';
        return `${companyName}: Payment received for debt #${debtId} - ${paid} paid. Balance: ${balance}`;
    },

    /**
     * Debt fully paid notification
     * @param {object} payload
     * @param {string} payload.debtId - Debt ID
     * @param {string} payload.totalAmount - Total amount paid
     * @param {string} payload.companyName - Company name
     */
    "debt.fully.paid": (payload) => {
        const { debtId, amount, totalAmount, companyName } = payload;
        const debtAmount = amount || totalAmount || '0 RWF';
        return `${companyName}: Debt #${debtId} fully paid! Total: ${debtAmount}. Thank you!`;
    },

    /**
     * Debt cancelled notification
     * @param {object} payload
     * @param {string} payload.debtId - Debt ID
     * @param {string} payload.reason - Reason for cancellation
     * @param {string} payload.companyName - Company name
     */
    "debt.cancelled": (payload) => {
        const { debtId, reason, companyName } = payload;
        return `${companyName}: Debt #${debtId} has been cancelled (${reason}). Contact us for details.`;
    },

    /**
     * Debt overdue reminder
     * @param {object} payload
     * @param {string} payload.debtId - Debt ID
     * @param {string} payload.amount - Outstanding amount
     * @param {string} payload.daysOverdue - Days overdue
     * @param {string} payload.companyName - Company name
     */
    "debt.overdue": (payload) => {
        const { debtId, amount, daysOverdue, companyName } = payload;
        return `${companyName}: ⚠️ Debt #${debtId} is ${daysOverdue} days overdue! Amount due: ${amount}. Pay now to avoid penalties.`;
    },

    /**
     * Appointment reminder
     * @param {object} payload
     * @param {string} payload.appointmentTime - Appointment time
     * @param {string} payload.location - Location
     * @param {string} payload.customerName - Customer name
     */
    appointment_reminder: (payload) => {
        const { appointmentTime, location, customerName } = payload;
        return `Hi ${customerName}, reminder: Appointment at ${appointmentTime}, ${location}. See you soon!`;
    },

    /**
     * Password reset code
     * @param {object} payload
     * @param {string} payload.resetCode - Reset code
     * @param {string} payload.userName - User name
     */
    password_reset: (payload) => {
        const { resetCode, userName } = payload;
        return `Hi ${userName}, your password reset code is: ${resetCode}. Valid for 15 minutes.`;
    },

    /**
     * Two-factor authentication code
     * @param {object} payload
     * @param {string} payload.code - 2FA code
     */
    two_factor_code: (payload) => {
        const { code } = payload;
        return `Your verification code is: ${code}. Do not share this code with anyone.`;
    },

    /**
     * Account verification code
     * @param {object} payload
     * @param {string} payload.verificationCode - Verification code
     * @param {string} payload.companyName - Company name
     */
    account_verification: (payload) => {
        const { verificationCode, companyName } = payload;
        return `${companyName} verification code: ${verificationCode}. Enter this to verify your account.`;
    },

    /**
     * OTP (One-Time Password) code
     * @param {object} payload
     * @param {string} payload.otp - OTP code (usually 6 digits)
     * @param {string} payload.companyName - Company name
     * @param {number} [payload.expiryMinutes=10] - Expiry time in minutes
     */
    otp: (payload) => {
        const { otp, companyName, expiryMinutes = 10 } = payload;
        return `${companyName} OTP: ${otp}. Valid for ${expiryMinutes} minutes. Do not share this code.`;
    },

    /**
     * Generic notification fallback
     * @param {object} payload
     * @param {string} payload.title - Notification title
     * @param {string} payload.body - Notification body
     */
    default: (payload) => {
        const { title, body } = payload;
        if (title && body) {
            return `${title}: ${body}`;
        }
        return body || title || 'You have a new notification.';
    }
};

/**
 * Get SMS message for a template
 * @param {string} templateName - Name of the template
 * @param {object} payload - Data to populate template
 * @param {object} options - Additional options
 * @param {number} options.maxLength - Maximum SMS length (default: 160)
 * @param {boolean} options.truncate - Whether to truncate if too long (default: true)
 * @returns {string} The formatted SMS message
 */
function getSmsMessage(templateName, payload, options = {}) {
    const { maxLength = 160, truncate = true } = options;

    // Get template function
    const templateFn = smsTemplates[templateName] || smsTemplates.default;

    try {
        // Execute template function
        let message = templateFn(payload);

        // Ensure message is a string
        if (typeof message !== 'string') {
            message = String(message);
        }

        // Truncate if needed
        if (truncate && message.length > maxLength) {
            message = message.substring(0, maxLength - 3) + '...';
        }

        return message;
    } catch (error) {
        console.error(`Error generating SMS for template ${templateName}:`, error);
        // Fallback to default template
        return smsTemplates.default(payload);
    }
}

/**
 * Check if template exists
 * @param {string} templateName - Name of the template
 * @returns {boolean} True if template exists
 */
function hasTemplate(templateName) {
    return templateName in smsTemplates;
}

/**
 * Get all available template names
 * @returns {string[]} Array of template names
 */
function getAvailableTemplates() {
    return Object.keys(smsTemplates);
}

module.exports = {
    smsTemplates,
    getSmsMessage,
    hasTemplate,
    getAvailableTemplates
};
