
module.exports = {
    eventChannelMapping: {
        // --- Company Events ---
        "company.created": {
            "service": "Notification-Service",
            "channels": ["email", "in-app"],
            "priority": "high"
        },
        "company.updated": {
            "service": "Notification-Service",
            "channels": ["in-app"],
            "priority": "low"
        },
        "company.status.changed": {
            "service": "Notification-Service",
            "channels": ["email", "in-app"],
            "priority": "medium"
        },
        "company.suspended": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "in-app"],
            "priority": "urgent"
        },
        "company.deleted": {
            "service": "Notification-Service",
            "channels": ["email"],
            "priority": "high"
        },
        "company.tierChanged": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "in-app"],
            "priority": "medium"
        },
        "company.allSuspended": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "in-app"],
            "priority": "urgent"
        },

        // --- Shop Events ---
        "shop.created": {
            "service": "Notification-Service",
            "channels": ["in-app"],
            "priority": "normal"
        },
        "shop.updated": {
            "service": "Notification-Service",
            "channels": ["in-app"],
            "priority": "low"
        },
        "shop.deleted": {
            "service": "Notification-Service",
            "channels": ["email", "in-app"],
            "priority": "high"
        },
        "shop.statusChanged": {
            "service": "Notification-Service",
            "channels": ["email", "in-app"],
            "priority": "low"
        },

        // --- Product & Inventory Events ---
        "product.created": {
            "service": "Notification-Service",
            "channels": ["in-app"],
            "priority": "low"
        },
        "product.updated": {
            "service": "Notification-Service",
            "channels": ["in-app"],
            "priority": "low"
        },
        "product.deleted": {
            "service": "Notification-Service",
            "channels": ["in-app"],
            "priority": "normal"
        },
        "inventory.low_stock": {
            "service": "Notification-Service",
            "channels": ["email", "push", "in-app"],
            "priority": "high"
        },
        "inventory.out_of_stock": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "push", "in-app"],
            "priority": "urgent"
        },
        // Legacy mapping support
        "inventory.lowStock": {
            "service": "Notification-Service",
            "channels": ["email", "push"],
            "priority": "high"
        },

        // --- Sale Events ---
        "sales.created": { // Legacy support
            "service": "Notification-Service",
            "channels": ["sms", "push", "in-app"],
            "priority": "high"
        },
        "sale.created": {
            "service": "Notification-Service",
            "channels": ["sms", "push", "in-app", "email"],
            "priority": "high"
        },
        "sale.completed": {
            "service": "Notification-Service",
            "channels": ["in-app"],
            "priority": "normal"
        },
        "sale.cancelled": {
            "service": "Notification-Service",
            "channels": ["email", "in-app"],
            "priority": "high"
        },
        "sale.refunded": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "in-app"],
            "priority": "medium"
        },
        "sales.refunded": { // Legacy support
            "service": "Notification-Service",
            "channels": ["email", "sms"],
            "priority": "medium"
        },

        // --- Payment Events ---
        "payment.success": {
            "service": "Notification-Service",
            "channels": ["email", "in-app", "push"],
            "priority": "high"
        },
        "payment.failed": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "push", "in-app"],
            "priority": "urgent"
        },
        "payment.refunded": {
            "service": "Notification-Service",
            "channels": ["email", "in-app"],
            "priority": "medium"
        },
        "subscription.expiring": {
            "service": "Notification-Service",
            "channels": ["email", "push", "in-app"],
            "priority": "high"
        },
        "subscription.expired": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "push", "in-app"],
            "priority": "urgent"
        },

        // --- Auth Events ---
        "user.created": {
            "service": "Notification-Service",
            "channels": ["email", "in-app"],
            "priority": "high"
        },
        "user.verified": {
            "service": "Notification-Service",
            "channels": ["in-app"],
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
            "channels": ["in-app", "push"],
            "priority": "normal"
        },
        "debt.repayment.created": {
            "service": "Notification-Service",
            "channels": ["in-app", "push"],
            "priority": "normal"
        },
        "debt.fully_paid": {
            "service": "Notification-Service",
            "channels": ["in-app", "email"],
            "priority": "medium"
        },
        "debt.status.updated": {
            "service": "Notification-Service",
            "channels": ["in-app"],
            "priority": "low"
        },
        "debt.cancelled": {
            "service": "Notification-Service",
            "channels": ["email", "in-app"],
            "priority": "medium"
        },
        "debt.overdue": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "push", "in-app"],
            "priority": "urgent"
        },
        "debt.reminder.upcoming": {
            "service": "Notification-Service",
            "channels": ["email", "push", "in-app"],
            "priority": "medium"
        },
        "debt.reminder.overdue": {
            "service": "Notification-Service",
            "channels": ["email", "sms", "push", "in-app"],
            "priority": "high"
        }
    }
};
