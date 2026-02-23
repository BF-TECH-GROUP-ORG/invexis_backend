
module.exports = {
    eventChannelMapping: {
        // --- Company Events ---
        "company.created": {
            "service": "Notification-Service",
            "channels": ["email", "inApp"],
            "priority": "high"
        },
        "company.updated": {
            "service": "Notification-Service",
            "channels": ["inApp"],
            "priority": "low"
        },
        "company.status.changed": {
            "service": "Notification-Service",
            "channels": ["email", "inApp"],
            "priority": "normal"
        },
        "company.suspended": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "inApp"],
            "priority": "urgent"
        },
        "company.deleted": {
            "service": "Notification-Service",
            "channels": ["email"],
            "priority": "high"
        },
        "company.tierChanged": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "inApp"],
            "priority": "normal"
        },
        "company.allSuspended": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "inApp"],
            "priority": "urgent"
        },

        // --- Shop Events ---
        "shop.created": {
            "service": "Notification-Service",
            "channels": ["inApp"],
            "priority": "normal"
        },
        "shop.updated": {
            "service": "Notification-Service",
            "channels": ["inApp"],
            "priority": "low"
        },
        "shop.deleted": {
            "service": "Notification-Service",
            "channels": ["email", "inApp"],
            "priority": "high"
        },
        "shop.statusChanged": {
            "service": "Notification-Service",
            "channels": ["email", "inApp"],
            "priority": "low"
        },

        // --- Product & Inventory Events ---
        "product.created": {
            "service": "Notification-Service",
            "channels": ["inApp"],
            "priority": "low"
        },
        "product.updated": {
            "service": "Notification-Service",
            "channels": ["inApp"],
            "priority": "low"
        },
        "product.deleted": {
            "service": "Notification-Service",
            "channels": ["inApp"],
            "priority": "normal"
        },
        "inventory.low_stock": {
            "service": "Notification-Service",
            "channels": ["email", "push", "inApp"],
            "priority": "high"
        },
        "inventory.low.stock": {
            "service": "Notification-Service",
            "channels": ["email", "push", "inApp"],
            "priority": "high"
        },
        "inventory.out_of_stock": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "push", "inApp"],
            "priority": "urgent"
        },
        "inventory.out.of.stock": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "push", "inApp"],
            "priority": "urgent"
        },
        // Legacy mapping support
        "inventory.lowStock": {
            "service": "Notification-Service",
            "channels": ["email", "push"],
            "priority": "high"
        },
        // Actual events emitted by inventory-service
        "inventory.product.low_stock": {
            "service": "Notification-Service",
            "channels": ["email", "push", "inApp"],
            "priority": "high"
        },
        "inventory.product.out_of_stock": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "push", "inApp"],
            "priority": "urgent"
        },
        "inventory.alert.product_expiring": {
            "service": "Notification-Service",
            "channels": ["email", "push", "inApp"],
            "priority": "high"
        },
        "inventory.alert.product_expired": {
            "service": "Notification-Service",
            "channels": ["email", "push", "inApp"],
            "priority": "urgent"
        },

        // --- Sale Events ---
        "sales.created": { // Legacy support
            "service": "Notification-Service",
            "channels": ["sms", "push", "inApp"],
            "priority": "high"
        },
        "sale.created": {
            "service": "Notification-Service",
            "channels": ["sms", "push", "inApp", "email"],
            "priority": "high"
        },
        "sale.completed": {
            "service": "Notification-Service",
            "channels": ["inApp"],
            "priority": "normal"
        },
        "sale.updated": {
            "service": "Notification-Service",
            "channels": ["inApp"],
            "priority": "low"
        },
        "sale.cancelled": {
            "service": "Notification-Service",
            "channels": ["email", "inApp"],
            "priority": "high"
        },
        "sale.deleted": {
            "service": "Notification-Service",
            "channels": ["email", "inApp"],
            "priority": "high"
        },
        "sale.refunded": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "inApp"],
            "priority": "normal"
        },
        "sale.return.created": {
            "service": "Notification-Service",
            "channels": ["email", "push", "inApp"],
            "priority": "high"
        },
        "sales.refunded": { // Legacy support
            "service": "Notification-Service",
            "channels": ["email", "sms"],
            "priority": "normal"
        },
        "sale.refund.processed": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "inApp"],
            "priority": "normal"
        },

        // --- Payment Events ---
        "payment.success": {
            "service": "Notification-Service",
            "channels": ["email", "inApp", "push"],
            "priority": "high"
        },
        "payment.failed": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "push", "inApp"],
            "priority": "urgent"
        },
        "payment.refunded": {
            "service": "Notification-Service",
            "channels": ["email", "inApp"],
            "priority": "normal"
        },
        "subscription.expiring": {
            "service": "Notification-Service",
            "channels": ["email", "push", "inApp"],
            "priority": "high"
        },
        "subscription.expired": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "push", "inApp"],
            "priority": "urgent"
        },

        // --- Auth Events ---
        "user.created": {
            "service": "Notification-Service",
            "channels": ["email", "inApp"],
            "priority": "high"
        },
        "user.verified": {
            "service": "Notification-Service",
            "channels": ["inApp"],
            "priority": "normal"
        },
        "user.password.reset": {
            "service": "Notification-Service",
            "channels": ["email", "sms"],
            "priority": "urgent"
        },
        "user.suspended": {
            "service": "Notification-Service",
            "channels": ["email", "sms"],
            "priority": "urgent"
        },
        "user.deleted": {
            "service": "Notification-Service",
            "channels": ["email"],
            "priority": "high"
        },

        // --- Debt Events ---
        "debt.created": {
            "service": "Notification-Service",
            "channels": ["inApp", "push"],
            "priority": "normal"
        },
        "debt.repayment.created": {
            "service": "Notification-Service",
            "channels": ["inApp", "push"],
            "priority": "normal"
        },
        "debt.fully_paid": {
            "service": "Notification-Service",
            "channels": ["inApp", "email"],
            "priority": "normal"
        },
        "debt.marked.paid": {
            "service": "Notification-Service",
            "channels": ["inApp", "email", "sms"],
            "priority": "high"
        },
        "debt.status.updated": {
            "service": "Notification-Service",
            "channels": ["inApp"],
            "priority": "low"
        },
        "debt.overdue": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "push", "inApp"],
            "priority": "urgent"
        },
        "debt.cancelled": {
            "service": "Notification-Service",
            "channels": ["email", "inApp"],
            "priority": "normal"
        },
        "debt.reminder.upcoming": {
            "service": "Notification-Service",
            "channels": ["email", "push", "inApp"],
            "priority": "normal"
        },
        "debt.reminder.overdue": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "push", "inApp"],
            "priority": "high"
        },
        // --- System Events ---
        "notification.broadcast": {
            "service": "Notification-Service",
            "channels": ["email", "push", "inApp"],
            "priority": "normal"
        }
    }
};
