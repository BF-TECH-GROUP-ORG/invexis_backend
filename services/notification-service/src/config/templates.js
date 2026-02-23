// src/config/templates.js

const fs = require('fs');
const path = require('path');

// Load template files
const loadTemplate = (filename) => {
    try {
        // __dirname = /app/src/config, so ../../templates/email = /app/templates/email
        const templatePath = path.join(__dirname, '../../templates/email', filename);

        if (!fs.existsSync(templatePath)) {
            console.warn(`Template file not found at: ${templatePath}`);
            return `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    <h2>Notification</h2>
                    <p>This is a default template because the file '${filename}' could not be loaded.</p>
                </div>
             `;
        }

        console.log(`Loading template from: ${templatePath}`);
        return fs.readFileSync(templatePath, 'utf-8');
    } catch (error) {
        console.error(`Failed to load template ${filename}:`, error.message);
        return `<html><body><h1>Hello!</h1><p>We encountered an error loading the email template.</p></body></html>`;
    }
};

const templates = {
    "welcome": {
        email: {
            subject: 'Welcome to {{companyName}} - Your Account is Ready',
            content: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6;">
                    <h2>Welcome to {{companyName}}!</h2>
                    <p>Hello {{userName}},</p>
                    <p>Your account has been successfully created. You have been enrolled in <strong>{{shopName}}</strong>.</p>
                    {{#if departments}}<p><strong>Assigned Department(s):</strong> {{departments}}</p>{{/if}}
                    
                    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p style="margin: 0;"><strong>Username:</strong> {{email}}</p>
                        <p style="margin: 10px 0 0 0;"><strong>Password:</strong> {{password}}</p>
                    </div>

                    <p>Please login immediately and change your password.</p>
                    
                    <div style="text-align: center; margin-top: 30px;">
                        <a href="{{dashboardUrl}}/login" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Login to Dashboard</a>
                    </div>
                </div>
            `,
            metadata: { priority: 'high' }
        },
        sms: {
            content: 'Welcome to {{companyName}}, {{userName}}! Your temp password is: {{password}}. Enrolled in {{shopName}}.',
            metadata: { maxLength: 160 }
        },
        push: {
            title: 'Welcome to {{companyName}}!',
            body: 'Hi {{userName}}, tap to complete your setup',
            data: { action: 'open_welcome', url: '{{actionUrl}}' },
            metadata: { sound: 'default' }
        },
        inApp: {
            subject: 'Welcome to {{companyName}}!',
            content: 'Hi {{userName}}, welcome to {{companyName}}! You are enrolled in **{{shopName}}**.'
        }
    },

    "welcome_manual": {
        email: {
            subject: 'Welcome to {{companyName}}!',
            content: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6;">
                    <h2>Welcome to {{companyName}}!</h2>
                    <p>Hello {{userName}},</p>
                    <p>Your account has been created. You have been enrolled in <strong>{{shopName}}</strong>.</p>
                    {{#if departments}}<p><strong>Assigned Department(s):</strong> {{departments}}</p>{{/if}}
                    <p>We are excited to have you on board.</p>
                    <a href="{{dashboardUrl}}/login">Login to Dashboard</a>
                </div>
            `,
            metadata: { priority: 'normal' }
        },
        sms: {
            content: 'Welcome to {{companyName}}, {{userName}}! Enrolled in {{shopName}}.',
            metadata: { maxLength: 160 }
        },
        push: {
            title: 'Welcome to {{companyName}}!',
            body: 'Hi {{userName}}, welcome aboard!',
            data: { action: 'open_welcome', url: '{{actionUrl}}' },
            metadata: { sound: 'default' }
        },
        inApp: {
            subject: 'Welcome to {{companyName}}!',
            content: 'Hi {{userName}}, welcome to {{companyName}}!'
        }
    },

    "stripe.onboarding": {
        email: {
            subject: 'Action Required: Complete your Payment Setup for {{companyName}}',
            content: loadTemplate('stripe_onboarding.html'),
            metadata: {
                priority: 'high'
            }
        },
        inApp: {
            subject: 'Setup Required',
            content: 'Please check your email to complete your payment account setup.'
        }
    },



    "order.notification": {
        email: {
            subject: 'Order {{orderId}} confirmed',
            content: `
    < h2 > Order confirmed — { { orderId } }</h2 >
        <p>Thanks for your purchase, {{userName}}. Here's your order summary:</p>
        <p><strong>Total: {{formatCurrency orderTotal}}</strong></p>
        <p><a href="{{actionUrl}}">View order details</a></p>
`
        },
        sms: {
            content: 'Order {{orderId}} confirmed! Total: {{orderTotal}}.'
        },
        push: {
            title: 'Order {{orderId}} confirmed',
            body: 'Your order total is {{orderTotal}}'
        },
        inApp: {
            subject: 'Order {{orderId}} confirmed',
            content: 'Your order {{orderId}} has been confirmed.'
        }
    },

    otp: {
        email: {
            subject: 'Your Verification Code - {{companyName}}',
            content: loadTemplate('otp.html'),
            metadata: {
                priority: 'high'
            }
        },
        sms: {
            content: '{{companyName}} OTP: {{otp}}. Valid for {{expiryMinutes}} minutes. Do not share this code.',
            metadata: {
                maxLength: 160
            }
        },
        push: {
            title: 'Verification Code',
            body: 'Your OTP: {{otp}}. Valid for {{expiryMinutes}} minutes',
            data: {
                action: 'otp',
                otp: '{{otp}}'
            },
            metadata: {
                sound: 'default',
                priority: 'high'
            }
        },
        inApp: {
            subject: 'Your Verification Code',
            content: 'Your OTP is {{otp}}. Valid for {{expiryMinutes}} minutes.'
        }
    },

    "sale.return.created": {
        email: {
            subject: 'Return Initiated for Sale #{{saleId}}',
            content: `
                <h2>Return Initiated — Sale #{{saleId}}</h2>
                <p>Hello,</p>
                <p>A return has been initiated for sale #{{saleId}}.</p>
                <div style="margin: 20px 0; padding: 15px; background-color: #fce4e4; border-radius: 5px;">
                   {{#if reason}}<p><strong>Reason:</strong> {{reason}}</p>{{/if}}
                   <p><strong>Refund Amount:</strong> {{formatCurrency refundAmount}}</p>
                </div>
                <p>— The {{companyName}} Team</p>
            `,
            metadata: { priority: 'normal' }
        },
        push: {
            title: 'Return Initiated',
            body: 'Return for sale #{{saleId}} initiated: {{formatCurrency refundAmount}}',
            data: { action: 'open_return', saleId: '{{saleId}}', returnId: '{{returnId}}' }
        },
        inApp: {
            subject: 'Return Initiated',
            content: 'Return for sale #{{saleId}} initiated for {{formatCurrency refundAmount}}'
        }
    },

    // --- SHOP NOTIFICATIONS ---
    // --- SHOP NOTIFICATIONS ---
    "shop.created": {
        push: {
            title: "New Shop Created",
            body: "A new shop **{{name}}** has been created by **{{performedByName}}**.",
            data: {
                type: "shop.created",
                shopId: "{{id}}"
            }
        },
        inApp: {
            title: "New Shop Created",
            body: "A new shop **{{name}}** has been created by **{{performedByName}}**.",
            actionUrl: "/shops/{{id}}"
        }
    },

    "shop.updated": {
        push: {
            title: "Shop Updated",
            body: "Shop **{{name}}** has been updated by **{{performedByName}}**.",
            data: {
                type: "shop.updated",
                shopId: "{{id}}"
            }
        },
        inApp: {
            title: "Shop Updated",
            body: "Shop **{{name}}** has been updated by **{{performedByName}}**.",
            actionUrl: "/shops/{{id}}"
        }
    },

    "shop.deleted": {
        push: {
            title: "Shop Deleted",
            body: "Shop **{{name}}** has been deleted by **{{performedByName}}**.",
            data: {
                type: "shop.deleted",
                shopId: "{{id}}"
            }
        },
        inApp: {
            title: "Shop Deleted",
            body: "Shop **{{name}}** has been deleted by **{{performedByName}}**.",
            actionUrl: "/shops"
        }
    },

    "shop.reminder.opening": {
        push: {
            title: "Shop Opening Soon",
            body: "Reminder: **{{shopName}}** is scheduled to open in **{{minutes}} minutes** ({{time}}).",
            data: {
                type: "shop.reminder.opening",
                shopId: "{{shopId}}"
            }
        },
        inApp: {
            title: "Shop Opening Soon",
            body: "Reminder: **{{shopName}}** is scheduled to open in **{{minutes}} minutes** ({{time}}).",
            actionUrl: "/shops/{{shopId}}"
        }
    },

    "shop.reminder.closing": {
        push: {
            title: "Shop Closing Soon",
            body: "Reminder: **{{shopName}}** is scheduled to close in **{{minutes}} minutes** ({{time}}).",
            data: {
                type: "shop.reminder.closing",
                shopId: "{{shopId}}"
            }
        },
        inApp: {
            title: "Shop Closing Soon",
            body: "Reminder: **{{shopName}}** is scheduled to close in **{{minutes}} minutes** ({{time}}).",
            actionUrl: "/shops/{{shopId}}"
        }
    },

    "shop.status_updated": {
        inApp: {
            subject: 'Shop Status Updated',
            content: 'Shop **{{name}}** is now **{{status}}**.'
        },
        push: {
            title: 'Shop Status Changed',
            body: 'Shop "{{name}}" is now {{status}}.',
            data: { action: 'open_shop', shopId: '{{id}}' }
        }
    },


    // --- PRODUCT & INVENTORY ---
    "product.created": {
        inApp: {
            subject: 'New Product Added',
            content: 'New product **{{productName}}** added by {{userName}}.'
        },
        push: {
            title: 'New Product',
            body: '{{productName}} was added to inventory.',
            data: { action: 'open_product', productId: '{{productId}}' }
        }
    },

    "product.updated": {
        inApp: {
            subject: 'Product Updated',
            content: 'Details for product **{{productName}}** were updated.'
        },
        push: {
            content: JSON.stringify({
                title: 'Product Updated',
                body: '{{productName}} details have been updated.',
                data: { action: 'open_product', productId: '{{productId}}' }
            })
        }
    },

    "product.deleted": {
        inApp: {
            subject: 'Product Deleted',
            content: 'Product **{{productName}}** was deleted by {{userName}}.'
        },
        push: {
            content: JSON.stringify({
                title: 'Product Deleted',
                body: '{{productName}} was removed from inventory.',
                data: { action: 'open_inventory' }
            })
        }
    },

    // Low Stock Alert Template
    "inventory.low_stock": {
        email: {
            subject: '⚠️ Low Stock Alert: {{productName}}',
            content: `
        < div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;" >
        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 20px 0;">
            <h2 style="color: #856404; margin: 0 0 15px 0;">⚠️ Low Stock Alert</h2>
            <p style="font-size: 16px; color: #333; margin: 10px 0;">
                <strong>Product:</strong> {{ productName }}
            </p>
            {{ #if sku }}
            <p style="font-size: 14px; color: #666; margin: 5px 0;">
                <strong>SKU:</strong> {{ sku }}
            </p>
            {{/if}}
            <div style="background-color: #fff; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <p style="margin: 5px 0;"><strong>Current Stock:</strong> <span style="color: #dc3545; font-size: 18px;">{{ currentStock }}</span> units</p>
                <p style="margin: 5px 0;"><strong>Threshold:</strong> {{ threshold }} units</p>
                {{ #if percentageOfThreshold }}
                <p style="margin: 5px 0;"><strong>Stock Level:</strong> {{ percentageOfThreshold }}% of threshold</p>
                {{/if}}
                {{ #if suggestedReorderQty }}
                <p style="margin: 5px 0;"><strong>Suggested Reorder:</strong> {{ suggestedReorderQty }} units</p>
                {{/if}}
            </div>
            <p style="color: #856404; font-weight: bold; margin: 15px 0 0 0;">
                ⚡ Action Required: Please restock soon to avoid stockouts.
            </p>
        </div>
                </div >
    `,
            metadata: { priority: 'high' }
        },
        sms: {
            content: '⚠️ LOW STOCK: {{productName}}{{#if sku}} ({{sku}}){{/if}} - Only {{currentStock}} left (threshold: {{threshold}}). Restock needed!',
            metadata: { maxLength: 160 }
        },
        push: {
            content: JSON.stringify({
                title: '⚠️ Low Stock: {{productName}}',
                body: 'Only {{currentStock}} units left (threshold: {{threshold}}). Restock needed!',
                data: {
                    action: 'open_inventory',
                    productId: '{{productId}}',
                    productName: '{{productName}}',
                    currentStock: '{{currentStock}}'
                }
            }),
            metadata: { priority: 'high', sound: 'default' }
        },
        inApp: {
            subject: '⚠️ Low Stock: {{productName}}',
            content: '**{{productName}}**{{#if sku}} (SKU: {{sku}}){{/if}} is running low. Current stock: **{{currentStock}}** units (threshold: {{threshold}}). {{#if suggestedReorderQty}}Suggested reorder: {{suggestedReorderQty}} units.{{/if}}'
        }
    },

    // Out of Stock Alert Template
    "inventory.out_of_stock": {
        email: {
            subject: '🚨 URGENT: {{productName}} is Out of Stock',
            content: `
    < div style = "font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;" >
        <div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 20px; margin: 20px 0;">
            <h2 style="color: #721c24; margin: 0 0 15px 0;">🚨 URGENT: Out of Stock Alert</h2>
            <p style="font-size: 18px; color: #333; margin: 10px 0; font-weight: bold;">
                Product: {{ productName }}
            </p>
            {{ #if sku }}
            <p style="font-size: 14px; color: #666; margin: 5px 0;">
                <strong>SKU:</strong> {{ sku }}
            </p>
            {{/if}}
            <div style="background-color: #fff; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <p style="margin: 5px 0; color: #dc3545; font-size: 20px; font-weight: bold;">
                    Current Stock: 0 units
                </p>
                <p style="margin: 5px 0;"><strong>Threshold:</strong> {{ threshold }} units</p>
            </div>
            <p style="color: #721c24; font-weight: bold; margin: 15px 0 0 0; font-size: 16px;">
                🚨 IMMEDIATE ACTION REQUIRED: This product is completely out of stock!
            </p>
        </div>
                </div >
    `,
            metadata: { priority: 'urgent' }
        },
        sms: {
            content: '🚨 URGENT: {{productName}}{{#if sku}} ({{sku}}){{/if}} is OUT OF STOCK! Immediate restocking required.',
            metadata: { maxLength: 160 }
        },
        push: {
            content: JSON.stringify({
                title: '🚨 OUT OF STOCK: {{productName}}',
                body: 'URGENT: {{productName}} is completely out of stock!',
                data: {
                    action: 'open_inventory',
                    productId: '{{productId}}',
                    productName: '{{productName}}',
                    priority: 'urgent'
                }
            }),
            metadata: { priority: 'urgent', sound: 'alert' }
        },
        inApp: {
            subject: '🚨 OUT OF STOCK: {{productName}}',
            content: '**URGENT:** {{productName}}{{#if sku}} (SKU: {{sku}}){{/if}} is completely out of stock! Immediate restocking required.'
        }
    },

    // Product Expiring soon
    "inventory.alert.product_expiring": {
        email: {
            subject: '📝 Warning: Product Expiring Soon - {{productName}}',
            content: `
    < div style = "font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;" >
        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 20px 0;">
            <h2 style="color: #856404; margin: 0 0 15px 0;">📝 Expiration Warning</h2>
            <p style="font-size: 16px; color: #333; margin: 10px 0;">
                <strong>Product:</strong> {{ productName }}
            </p>
            <div style="background-color: #fff; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <p style="margin: 5px 0;"><strong>Expiry Date:</strong> <span style="color: #dc3545; font-size: 18px;">{{ formatDate expiryDate 'short'}}</span></p>
                <p style="margin: 5px 0;"><strong>Days Remaining:</strong> {{ daysToExpiry }} days</p>
            </div>
            <p style="color: #856404; font-weight: bold; margin: 15px 0 0 0;">
                ⚡ Action Required: Please check stock and plan for removal or discount.
            </p>
        </div>
                </div >
    `,
            metadata: { priority: 'high' }
        },
        push: {
            content: JSON.stringify({
                title: '📝 Expiring: {{productName}}',
                body: 'Expires in {{daysToExpiry}} days ({{formatDate expiryDate "short"}}).',
                data: {
                    action: 'open_product',
                    productId: '{{productId}}'
                }
            }),
            metadata: { priority: 'high' }
        },
        inApp: {
            subject: '📝 Expiring soon: {{productName}}',
            content: '**{{productName}}** will expire in **{{daysToExpiry}} days** ({{formatDate expiryDate "short"}}).'
        }
    },

    // Product Expired
    "inventory.alert.product_expired": {
        email: {
            subject: '🚨 URGENT: Product Expired - {{productName}}',
            content: `
    < div style = "font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;" >
        <div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 20px; margin: 20px 0;">
            <h2 style="color: #721c24; margin: 0 0 15px 0;">🚨 URGENT: Product Expired</h2>
            <p style="font-size: 18px; color: #333; margin: 10px 0; font-weight: bold;">
                Product: {{ productName }}
            </p>
            <div style="background-color: #fff; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <p style="margin: 5px 0; color: #dc3545; font-size: 20px; font-weight: bold;">
                    EXPIRED ON: {{ formatDate expiryDate 'short'}}
                </p>
            </div>
            <p style="color: #721c24; font-weight: bold; margin: 15px 0 0 0; font-size: 16px;">
                🚨 IMMEDIATE ACTION REQUIRED: Remove this product from sale immediately!
            </p>
        </div>
                </div >
    `,
            metadata: { priority: 'urgent' }
        },
        push: {
            content: JSON.stringify({
                title: '🚨 EXPIRED: {{productName}}',
                body: 'IMMEDIATE ACTION: Product expired on {{formatDate expiryDate "short"}}!',
                data: {
                    action: 'open_product',
                    productId: '{{productId}}'
                }
            }),
            metadata: { priority: 'urgent', sound: 'alert' }
        },
        inApp: {
            subject: '🚨 EXPIRED: {{productName}}',
            content: '**URGENT:** {{productName}} expired on {{formatDate expiryDate "short"}}! Remove from sale immediately.'
        }
    },

    // Legacy templates (kept for backward compatibility)
    "inventory.low_stock": {
        email: {
            subject: 'Low Stock Alert: {{productName}}',
            content: `
    < div style = "font-family: Arial, sans-serif;" >
                    <h2>Low Stock Warning</h2>
                    <p>Product <strong>{{productName}}</strong> is running low at <strong>{{shopName}}</strong>.</p>
                    <p><strong>Current Stock:</strong> {{currentStock}}</p>
                    <p><strong>Reorder Level:</strong> {{reorderLevel}}</p>
                    <a href="{{dashboardUrl}}/inventory/restock?productId={{productId}}&shopId={{shopId}}">Restock Now</a>
                </div >
    `,
            metadata: { priority: 'high' }
        },
        push: {
            content: JSON.stringify({
                title: 'Low Stock Alert',
                body: '{{productName}} is running low at {{shopName}} ({{currentStock}} remaining).',
                data: { action: 'open_restock', productId: '{{productId}}' }
            })
        },
        inApp: {
            subject: 'Low Stock Alert',
            content: 'Product **{{productName}}** is running low at **{{shopName}}** (**{{currentStock}}** remaining).'
        }
    },
    "inventory.out_of_stock": {
        email: {
            subject: 'STOCK OUT: {{productName}} - {{shopName}}',
            content: `< p >🚨 <strong>STOCK OUT ALERT</strong></p > <p>Product <strong>{{ productName }}</strong> is now out of stock at <strong>{{ shopName }}</strong>!</p>`,
            metadata: { priority: 'high' }
        },
        inApp: {
            subject: 'Stock Out Alert',
            content: '🚨 Stock out: **{{productName}}** is now out of stock at **{{shopName}}**!'
        },
        push: {
            content: JSON.stringify({
                title: 'Stock Out',
                body: '🚨 {{productName}} is out of stock at {{shopName}}!',
                data: { action: 'open_inventory', productId: '{{productId}}' }
            }),
            metadata: { priority: 'high' }
        }
    },

    // --- DEBTS ---


    // --- PAYMENTS ---
    "payment.success": {
        inApp: {
            subject: 'Payment Received',
            content: 'Payment of **{{formatCurrency amount}}** received from **{{customerName}}** ({{paymentMethod}}). {{#if url}}[Download Invoice]({{url}}){{/if}}'
        },
        push: {
            content: JSON.stringify({
                title: 'Payment Received',
                body: 'Received {{formatCurrency amount}} via {{paymentMethod}}',
                data: {
                    action: 'open_payment',
                    paymentId: '{{paymentId}}',
                    invoiceUrl: '{{url}}'
                }
            })
        }
    },
    "payment.failed": {
        inApp: {
            subject: 'Payment Failed',
            content: 'Payment of **{{formatCurrency amount}}** from **{{customerName}}** failed. Reason: {{reason}}.'
        },
        push: {
            title: 'Payment Failed',
            body: 'Payment of {{formatCurrency amount}} failed: {{reason}}',
            data: { action: 'open_payment', paymentId: '{{paymentId}}' },
            metadata: { priority: 'high' }
        },
        email: {
            subject: 'Payment Failed - {{companyName}}',
            content: `
    < div style = "font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;" >
                    <h2 style="color: #dc3545;">Payment Failed</h2>
                    <p>We were unable to process a payment for your company.</p>
                    <div style="background-color: #f8d7da; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p><strong>Amount:</strong> {{formatCurrency amount}}</p>
                        <p><strong>Reason:</strong> {{reason}}</p>
                    </div>
                    <p>Please check your payment settings to avoid service interruption.</p>
                </div >
    `
        }
    },

    // --- SUBSCRIPTIONS ---
    "subscription.created": {
        email: {
            subject: 'Welcome to Your Invexis Subscription',
            content: `<p>Hello,</p><p>Your subscription for **{{companyName}}** has been successfully created. You are now on the **{{tier}}** plan.</p><p>Your subscription is active until {{formatDate expiryDate 'long'}}.</p><p>Thank you for choosing Invexis!</p>`
        },
        inApp: {
            subject: 'Subscription Created',
            content: '✅ Your subscription for **{{companyName}}** is now active ({{tier}} plan).'
        },
        push: {
            title: 'Subscription Created',
            body: 'Your subscription for {{companyName}} is now active ({{tier}} plan).',
            data: { action: 'open_subscription' }
        }
    },
    "subscription.expiring": {
        email: {
            subject: 'Action Required: Your Subscription is Expiring Soon',
            content: `< p > Hello,</p ><p>Your subscription for {{companyName}} will expire on {{formatDate expiryDate 'long'}}.</p><p>Please renew now to avoid service interruption.</p>`,
            metadata: { priority: 'high' }
        },
        inApp: {
            subject: 'Subscription Expiring',
            content: 'Your subscription expires on {{formatDate expiryDate "short"}}. Renew now to maintain access.'
        },
        push: {
            title: 'Subscription Expiring Soon',
            body: 'Your subscription expires on {{formatDate expiryDate "short"}}. Renew now to avoid interruption.',
            data: { action: 'open_subscription' },
            metadata: { priority: 'high' }
        }
    },
    "subscription.expired": {
        email: {
            subject: 'Service Suspended: Subscription Expired',
            content: `< p > Hello,</p ><p>Your subscription has expired. Access to premium features has been suspended.</p><p>Please renew immediately to restore access.</p>`,
            metadata: { priority: 'high' }
        },
        sms: {
            content: '🚨 ALERT: Your Invexis subscription for {{companyName}} has expired and service is suspended. Please renew now to restore access.',
            metadata: {
                smsConfig: { maxLength: 160 }
            }
        },
        inApp: {
            subject: 'Subscription Expired',
            content: '🚨 Your subscription has expired on {{formatDate expiredAt "short"}}. Please renew to restore services.'
        },
        push: {
            title: 'Subscription Expired',
            body: 'Your subscription has expired. Renew now to restore access.',
            data: { action: 'open_subscription' },
            metadata: { priority: 'high' }
        }
    },
    "subscription.renewed": {
        email: {
            subject: 'Subscription Renewed Successfully',
            content: `<p>Hello,</p><p>Your subscription for {{companyName}} has been successfully renewed until {{formatDate expiryDate 'long'}}.</p><p>Thank you for your business!</p>`
        },
        inApp: {
            subject: 'Subscription Renewed',
            content: '✅ Your subscription has been renewed until {{formatDate expiryDate "short"}}.'
        },
        push: {
            title: 'Subscription Renewed',
            body: 'Subscription renewed until {{formatDate expiryDate "short"}}.',
            data: { action: 'open_subscription' }
        }
    },
    "company.suspended": {
        inApp: {
            title: 'Account Suspended',
            body: 'Your company account **{{companyName}}** has been suspended. Please contact support.'
        },
        push: {
            title: 'Account Suspended',
            body: 'Your company access for {{companyName}} has been suspended.',
            data: { action: 'contact_support' }
        },
        email: {
            subject: 'Urgent: Company Account Suspended',
            content: `
                <div style="font-family: Arial, sans-serif;">
                    <h2 style="color: #dc3545;">Account Suspended</h2>
                    <p>Access to your company **{{companyName}}** has been suspended by an administrator.</p>
                    <p>Reason: {{reason}}</p>
                    <p>If you believe this is an error, please contact our support team immediately.</p>
                </div>
            `
        }
    },
    "company.updated": {
        inApp: {
            title: 'Company Profile Updated',
            body: 'The profile for **{{companyName}}** has been updated.'
        },
        push: {
            title: 'Company Updated',
            body: 'The profile for {{companyName}} has been updated.',
            data: { action: 'open_company_settings' }
        }
    },
    "company.status.changed": {
        inApp: {
            title: 'Account Status Changed',
            body: 'Company **{{companyName}}** status changed to **{{status}}**.'
        },
        push: {
            title: 'Account Status Changed',
            body: 'Company {{companyName}} status is now {{status}}.',
            data: { action: 'open_dashboard' }
        }
    },
    "company.deleted": {
        inApp: {
            title: 'Company Deleted',
            body: 'Company **{{companyName}}** ({{companyId}}) has been permanently deleted.'
        },
        push: {
            title: 'Company Deleted',
            body: 'Important: Company {{companyName}} has been deleted.',
            data: { action: 'open_admin_panel' }
        }
    },
    "company.created.admin": {
        inApp: {
            title: 'New Company Created',
            body: 'A new company **{{companyName}}** has been created by **{{adminEmail}}**.'
        },
        push: {
            title: 'New Company Created',
            body: 'Company {{companyName}} has been added to the platform.',
            data: { action: 'open_dashboard' }
        },
        email: {
            subject: 'New Company Registered: {{companyName}}',
            content: `
                <div style="font-family: Arial, sans-serif;">
                    <h2>New Company Alert</h2>
                    <p>A new company has been registered on the platform:</p>
                    <ul>
                        <li><strong>Name:</strong> {{companyName}}</li>
                        <li><strong>ID:</strong> {{companyId}}</li>
                        <li><strong>Admin:</strong> {{userName}}</li>
                        <li><strong>Email:</strong> {{adminEmail}}</li>
                    </ul>
                    <p>Please review the onboarding status if necessary.</p>
                </div>
            `
        }
    },

    // --- Sales Templates ---
    // --- Sales Templates ---
    "sale.created": {
        email: {
            subject: 'New Sale: {{saleId}} at {{shopName}}',
            content: `
    < div style = "font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;" >
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; border: 1px solid #dee2e6;">
            <h2 style="color: #28a745; margin-top: 0;">New Sale Recorded</h2>
            <p>A new sale has been successfully processed at <strong>{{ shopName }}</strong>.</p>

            <div style="background-color: #ffffff; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Sale ID:</strong> #{{ saleId }}</p>
                <p style="margin: 5px 0;"><strong>Total Amount:</strong> <span style="font-size: 18px; color: #28a745; font-weight: bold;">{{ formatCurrency totalAmount }}</span></p>
                {{ #if customerId }}<p style="margin: 5px 0;"><strong>Customer:</strong> {{ customerName }}</p>{{/if}}
            </div>

            <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px;">Items Sold:</h3>
            <ul style="list-style: none; padding: 0;">
                {{ #each items }}
                <li style="padding: 8px 0; border-bottom: 1px solid #f1f1f1;">
                    {{ productName }} x {{ quantity }} - <strong>{{ formatCurrency total }}</strong>
                </li>
                {{/ each}}
            </ul>

            <div style="margin-top: 25px; font-size: 14px; color: #6c757d;">
                <p><strong>Processed by:</strong> {{ performedByName }}</p>
                <p><strong>Date:</strong> {{ formatDate createdAt 'long'}}</p>
            </div>
        </div>
                </div >
    `
        },
        sms: {
            content: '{{companyName}}: Order #{{saleId}} confirmed! {{#each items}}{{productName}} ({{quantity}}), {{/each}} Total: {{formatCurrency totalAmount}}. Thank you for shopping at {{shopName}}!'
        },
        push: {
            title: 'New Sale: {{formatCurrency totalAmount}}',
            body: 'Sale {{saleId}} recorded at {{shopName}} by {{performedByName}}.',
            data: { action: 'open_sale', saleId: '{{saleId}}' }
        },
        inApp: {
            subject: 'New Sale: {{formatCurrency totalAmount}}',
            content: 'Sale **{{saleId}}** for **{{formatCurrency totalAmount}}** created at **{{shopName}}** by **{{performedByName}}**.'
        }
    },

    "sale.refund.processed": {
        email: {
            subject: 'Refund Processed: Sale #{{saleId}}',
            content: `
    < div style = "font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;" >
        <div style="background-color: #fffaf0; padding: 20px; border-radius: 8px; border: 1px solid #ffeeba;">
            <h2 style="color: #856404; margin-top: 0;">Refund Processed</h2>
            <p>A refund has been successfully processed for sale #<strong>{{ saleId }}</strong> at {{ shopName }}.</p>

            <div style="background-color: #ffffff; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Refund Amount:</strong> <span style="font-size: 18px; color: #dc3545; font-weight: bold;">{{ formatCurrency refundAmount }}</span></p>
                <p style="margin: 5px 0;"><strong>Original Sale:</strong> #{{ saleId }}</p>
            </div>

            <p>The funds will be reflected in the account shortly.</p>
            <p>— The {{ companyName }} Team</p>
        </div>
                </div >
    `
        },
        sms: {
            content: '{{companyName}}: Refund processed for Order #{{saleId}}. Amount: {{formatCurrency refundAmount}}. Thank you for your patience.'
        },
        push: {
            title: 'Refund Processed: {{formatCurrency refundAmount}}',
            body: 'A refund has been completed for sale #{{saleId}} at {{shopName}}.',
            data: { action: 'open_sale', saleId: '{{saleId}}' }
        },
        inApp: {
            subject: 'Refund Processed: {{formatCurrency refundAmount}}',
            content: 'Refund for sale **{{saleId}}** at **{{shopName}}** has been completed.'
        }
    },

    "sale.return.approved": {
        email: {
            subject: 'Return Approved: Sale #{{saleId}}',
            content: `< h2 > Return Approved</h2 > <p>Your return for sale #{{ saleId }} has been approved. Refund is being processed.</p>`
        },
        sms: {
            content: '{{companyName}}: Your return for Order #{{saleId}} has been APPROVED. Refund of {{formatCurrency refundAmount}} is incoming.'
        },
        inApp: {
            subject: 'Return Approved',
            content: 'Return for sale **{{saleId}}** has been approved.'
        }
    },

    "sale.updated": {
        inApp: {
            subject: 'Sale Updated',
            content: 'Sale **{{saleId}}** at **{{shopName}}** was updated by **{{performedByName}}**.'
        },
        push: {
            title: 'Sale Updated',
            body: 'Sale {{saleId}} updated at {{shopName}} by {{performedByName}}.',
            data: { action: 'open_sale', saleId: '{{saleId}}' }
        },
    },

    "sale.deleted": {
        inApp: {
            subject: 'Sale Deleted',
            content: 'Sale **{{saleId}}** at **{{shopName}}** was deleted by **{{performedByName}}**.'
        },
        push: {
            title: 'Sale Deleted',
            body: 'Sale {{saleId}} removed from {{shopName}} by {{performedByName}}.',
            data: { action: 'open_dashboard' }
        },
    },

    "sale.cancelled": {
        email: {
            subject: 'Sale Cancelled: {{saleId}}',
            content: `
    < div style = "font-family: Arial, sans-serif;" >
                    <h2>Sale Cancelled</h2>
                    <p>Sale #{{saleId}} at <strong>{{shopName}}</strong> has been cancelled by <strong>{{performedByName}}</strong>.</p>
{ { #if reason } } <p><strong>Reason:</strong> {{ reason }}</p>{ {/if } }
<p><strong>Amount:</strong> {{ formatCurrency totalAmount }}</p>
                </div >
    `,
            metadata: { priority: 'normal' }
        },
        push: {
            content: JSON.stringify({
                title: 'Sale Cancelled',
                body: 'Sale {{saleId}} at {{shopName}} cancelled by {{performedByName}}.',
                data: { action: 'open_sale', saleId: '{{saleId}}' }
            })
        },
        inApp: {
            subject: 'Sale Cancelled',
            content: 'Sale **{{saleId}}** at **{{shopName}}** cancelled by **{{performedByName}}**.'
        }
    },

    // --- Debt Templates ---
    "debt.reminder.upcoming": {
        email: {
            subject: 'Reminder: Scheduled Payment Due Soon',
            content: `
    < div style = "font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;" >
                    <h2 style="color: #0056b3;">Upcoming Payment Reminder</h2>
                    <p>Hello {{customerName}},</p>
                    <p>This is a gentle reminder that a payment of <strong>{{formatCurrency amount}}</strong> for debt #{{debtId}} is due on <strong>{{dueDate}}</strong>.</p>
                    <p>Please ensure payment is made by the due date to avoid any tracking issues.</p>
                    <p><strong>Total Remaining Balance:</strong> {{formatCurrency remainingBalance}}</p>
                    <p>Thank you for your business!</p>
                    <p>— {{shopName}}</p>
                </div >
    `,
            metadata: { priority: 'normal' }
        },
        sms: {
            content: 'Hello {{customerName}}, reminder from {{shopName}}: Payment of {{formatCurrency amount}} for Debt #{{debtId}} is due on {{dueDate}}.',
            metadata: { maxLength: 160 }
        },
        inApp: {
            subject: 'Upcoming Debt Payment',
            content: 'Reminder: Payment of **{{formatCurrency amount}}** for **{{customerName}}** at **{{shopName}}** is due on **{{dueDate}}**.'
        }
    },

    "debt.reminder.overdue": {
        email: {
            subject: 'Action Required: Payment Overdue - {{shopName}}',
            content: `
    < div style = "font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;" >
                    <h2 style="color: #dc3545;">Payment Overdue Notice</h2>
                    <p>Hello {{customerName}},</p>
                    <p>We noticed that the payment of <strong>{{formatCurrency amount}}</strong> for debt #{{debtId}} was due on <strong>{{dueDate}}</strong> and is now overdue.</p>
                    <p>Please arrange for payment as soon as possible.</p>
                    <p><strong>Total Outstanding Balance:</strong> {{formatCurrency remainingBalance}}</p>
                    <p>If you have already made this payment, please disregard this notice.</p>
                    <p>— {{shopName}}</p>
                </div >
    `,
            metadata: { priority: 'high' }
        },
        sms: {
            content: 'URGENT: {{customerName}}, payment of {{formatCurrency amount}} to {{shopName}} was due on {{dueDate}}. Please pay immediately.',
            metadata: { maxLength: 160 }
        },
        inApp: {
            subject: 'Debt Payment Overdue',
            content: '⚠️ Overdue: Payment of **{{formatCurrency amount}}** for **{{customerName}}** at **{{shopName}}** was due on **{{dueDate}}**.'
        }
    },
    "debt.created": {
        email: {
            subject: 'New Debt Recorded - {{companyName}}',
            content: loadTemplate('debt_created.html'),
            metadata: { priority: 'normal' }
        },
        sms: {
            content: 'Hello {{customerName}}, a debt of {{formatCurrency amount}} was recorded for you at {{shopName}}. Due: {{dueDate}}.',
            metadata: { maxLength: 160 }
        },
        inApp: {
            subject: 'New Debt Recorded',
            content: 'New debt of **{{formatCurrency amount}}** recorded for **{{customerName}}** at **{{shopName}}** by **{{performedByName}}**.'
        },
        push: {
            title: 'New Debt Recorded',
            body: 'Debt of {{formatCurrency amount}} recorded at {{shopName}} by {{performedByName}}.',
            data: { action: 'open_debt', debtId: '{{debtId}}' }
        },
    },

    "debt.payment.received": {
        email: {
            subject: 'Payment Received - {{companyName}}',
            content: loadTemplate('debt_paid.html'),
            metadata: { priority: 'normal' }
        },
        sms: {
            content: 'Thank you {{customerName}}! We received {{formatCurrency amount}} at {{shopName}}. Remaining: {{formatCurrency remainingBalance}}.',
            metadata: { maxLength: 160 }
        },
        inApp: {
            subject: 'Debt Payment Received',
            content: 'Debt payment of **{{formatCurrency amount}}** received from **{{customerName}}** at **{{shopName}}** (recorded by **{{performedByName}}**).'
        },
        push: {
            title: 'Debt Payment',
            body: 'Received {{formatCurrency amount}} from {{customerName}} at {{shopName}}.',
            data: { action: 'open_debt', debtId: '{{debtId}}' }
        },
    },
    "debt.repayment.created": {
        sms: {
            content: 'Payment Received: You paid {{formatCurrency amount}} for Debt #{{debtId}} at {{shopName}}. Remaining balance: {{formatCurrency remainingBalance}}.',
            metadata: { maxLength: 160 }
        },
        inApp: {
            subject: 'Debt Repayment Recorded',
            content: 'Debt repayment of **{{formatCurrency amount}}** recorded for **{{customerName}}** at **{{shopName}}** by **{{performedByName}}**. New balance: **{{formatCurrency remainingBalance}}**.'
        },
        push: {
            title: 'Debt Repayment',
            body: '{{customerName}} paid {{formatCurrency amount}}. Balance: {{formatCurrency remainingBalance}}.',
            data: { action: 'open_debt', debtId: '{{debtId}}' }
        },
    },

    "debt.fully_paid": {
        sms: {
            content: 'Congratulations {{customerName}}, your debt #{{debtId}} at {{shopName}} has been fully paid. Thank you!',
            metadata: { maxLength: 160 }
        },
        email: {
            subject: 'Debt Fully Paid: {{customerName}}',
            content: `
    < div style = "font-family: Arial, sans-serif;" >
                    <h2>Debt Cleared</h2>
                    <p>The debt for {{customerName}} at {{shopName}} has been fully paid.</p>
                    <p><strong>Amount Cleared:</strong> {{formatCurrency amount}}</p>
                </div >
    `
        },
        inApp: {
            subject: 'Debt Cleared via Payment',
            content: 'Debt for **{{customerName}}** at **{{shopName}}** has been fully paid.'
        },
        push: {
            title: 'Debt Fully Paid',
            body: 'The debt for {{customerName}} at {{shopName}} has been cleared.',
            data: { action: 'open_debt', debtId: '{{debtId}}' }
        },
    },
    "debt.fully.paid": { // Legacy support mapping
        sms: {
            content: 'Congratulations {{customerName}}, your debt #{{debtId}} at {{shopName}} has been fully paid. Thank you!',
            metadata: { maxLength: 160 }
        },
        inApp: {
            subject: 'Debt Cleared via Payment',
            content: 'Debt for **{{customerName}}** at **{{shopName}}** has been fully paid.'
        }
    },

    "debt.cancelled": {
        sms: {
            content: 'Notice: Your debt #{{debtId}} for {{formatCurrency amount}} at {{shopName}} has been cancelled/written off.',
            metadata: { maxLength: 160 }
        },
        email: {
            subject: 'Debt Cancelled: {{customerName}}',
            content: `
    < div style = "font-family: Arial, sans-serif;" >
                    <h2>Debt Cancelled</h2>
                    <p>The debt for {{customerName}} at {{shopName}} has been cancelled.</p>
                    <p><strong>Amount:</strong> {{formatCurrency amount}}</p>
                </div >
    `
        },
        inApp: {
            subject: 'Debt Cancelled',
            content: 'Debt of **{{formatCurrency amount}}** for **{{customerName}}** at **{{shopName}}** has been cancelled.'
        },
        push: {
            title: 'Debt Cancelled',
            body: 'Debt of {{formatCurrency amount}} for {{customerName}} at {{shopName}} was cancelled.',
            data: { action: 'open_debt', debtId: '{{debtId}}' }
        },
    },

    "debt.status.updated": {
        inApp: {
            subject: 'Debt Status Updated',
            content: 'Debt status for **{{customerName}}** at **{{shopName}}** is now **{{status}}**.'
        },
        push: {
            title: 'Debt Status Changed',
            body: 'Debt for {{customerName}} at {{shopName}} is now {{status}}.',
            data: { action: 'open_debt', debtId: '{{debtId}}' }
        },
    },

    "debt.overdue": {
        sms: {
            content: 'URGENT: {{customerName}}, your debt #{{debtId}} at {{shopName}} is overdue by {{daysOverdue}} days. Total Due: {{formatCurrency amount}}.',
            metadata: { maxLength: 160 }
        },
        email: {
            subject: 'Overdue Debt Reminder: {{customerName}} at {{shopName}}',
            content: `
    < div style = "font-family: Arial, sans-serif;" >
                    <h2>Debt Overdue Reminder</h2>
                    <p>Dear {{customerName}},</p>
                    <p>This is a reminder that your debt #{{debtId}} at <strong>{{shopName}}</strong> is overdue by {{daysOverdue}} days.</p>
                    <p><strong>Amount Due:</strong> {{formatCurrency amount}}</p>
                    <p>Please settle this payment as soon as possible.</p>
                </div >
    `,
            metadata: { priority: 'high' }
        },
        inApp: {
            subject: 'Debt Overdue',
            content: '⚠️ Debt #{{debtId}} for **{{customerName}}** at **{{shopName}}** is overdue by {{daysOverdue}} days. Amount: {{formatCurrency amount}}.'
        },
        push: {
            title: 'Debt Overdue',
            body: 'Your debt of {{formatCurrency amount}} at {{shopName}} is overdue. Please pay now.',
            data: { action: 'open_debt', debtId: '{{debtId}}' },
            metadata: { priority: 'high' }
        },
    },
    "inventory.stock.updated": {
        inApp: {
            subject: 'Stock Updated: {{productName}}',
            content: 'Stock for **{{productName}}** at **{{shopName}}** updated by **{{performedByName}}**. New quantity: **{{newQuantity}}**.'
        },
        push: {
            content: JSON.stringify({
                title: 'Stock Update',
                body: 'Stock for {{productName}} at {{shopName}} updated to {{newQuantity}} by {{performedByName}}.',
                data: { action: 'open_product', productId: '{{productId}}' }
            })
        }
    },

    "inventory.bulk.stock_in": {
        inApp: {
            subject: 'Bulk Stock In Completed',
            content: 'Successfully restocked **{{successCount}}** products. Total requested: **{{totalRequested}}**.'
        },
        push: {
            content: JSON.stringify({
                title: 'Bulk Restock Success',
                body: '{{successCount}} products were restocked successfully.',
                data: { action: 'open_stock_history' }
            })
        }
    },

    "inventory.bulk.stock_out": {
        inApp: {
            subject: 'Bulk Stock Removal Completed',
            content: 'Successfully removed stock for **{{successCount}}** products. Total requested: **{{totalRequested}}**.'
        },
        push: {
            title: 'Bulk Removal Success',
            body: '{{successCount}} products were updated.',
            data: { action: 'open_stock_history' }
        }
    },

    "inventory.transfer.created": {
        email: {
            subject: 'Transfer Initiated: {{productName}}',
            content: `
    < div style = "font-family: Arial, sans-serif;" >
                    <h2>Transfer Initiated</h2>
                    <p>Transfer of <strong>{{quantity}}</strong> x <strong>{{productName}}</strong> has been initiated.</p>
                    <p><strong>From:</strong> {{sourceShopName}}</p>
                    <p><strong>To:</strong> {{destinationShopName}}</p>
{ { #if performedByName } } <p><strong>Initiated by:</strong> {{ performedByName }}</p>{ {/if } }
                </div >
    `
        },
        push: {
            title: 'Transfer Initiated',
            body: 'Transfer of {{quantity}} {{productName}} from {{sourceShopName}} to {{destinationShopName}} started by {{performedByName}}.',
            data: { action: 'open_transfer', transferId: '{{transferId}}' }
        },
        inApp: {
            subject: 'Transfer Initiated',
            content: 'Transfer of **{{quantity}}** x **{{productName}}** from **{{sourceShopName}}** to **{{destinationShopName}}** initiated by **{{performedByName}}**.'
        }
    },

    "inventory.transfer.completed": {
        inApp: {
            subject: 'Transfer Completed',
            content: 'Transfer of **{{quantity}}** x **{{productName}}** to **{{destinationShopName}}** has been completed (received by **{{performedByName}}**).'
        },
        push: {
            title: 'Transfer Completed',
            body: 'Transfer of {{quantity}} {{productName}} to {{destinationShopName}} completed.',
            data: { action: 'open_transfer', transferId: '{{transferId}}' }
        }
    },

    "inventory.transfer.bulk.intra": {
        inApp: {
            subject: 'Bulk Intra-Company Transfer',
            content: 'Successfully transferred **{{count}}** products from **{{sourceShopName}}** to **{{destinationShopName}}**.'
        },
        push: {
            title: 'Bulk Transfer Success',
            body: '{{count}} products transferred from {{sourceShopName}} to {{destinationShopName}}.',
            data: { action: 'open_transfers' }
        }
    },

    "inventory.transfer.bulk.cross.sent": {
        inApp: {
            subject: 'Bulk Cross-Company Transfer Sent',
            content: 'Sent **{{count}}** products to company **{{targetCompanyId}}**.'
        }
    },

    "inventory.transfer.bulk.cross.received": {
        inApp: {
            subject: 'Bulk Cross-Company Transfer Received',
            content: 'Received **{{count}}** products from company **{{sourceCompanyId}}**.'
        }
    },

    "inventory.transfer.cross.sent": {
        inApp: {
            subject: 'Transfer Sent: {{productName}}',
            content: 'Sent **{{quantity}}** units of **{{productName}}** to company **{{targetCompanyId}}**.'
        },
        push: {
            title: 'Transfer Sent',
            body: '{{quantity}} units of {{productName}} sent to {{targetCompanyId}}.',
            data: { action: 'open_transfers' }
        }
    },

    "inventory.transfer.cross.received": {
        inApp: {
            subject: 'Transfer Received: {{productName}}',
            content: 'Received **{{quantity}}** units of **{{productName}}** from company **{{sourceCompanyId}}**.'
        },
        push: {
            title: 'Transfer Received',
            body: 'Received {{quantity}} units of {{productName}} from {{sourceCompanyId}}.',
            data: { action: 'open_transfers' }
        }
    },

    // --- STAFF MANAGEMENT ---
    "staff.department_assigned": {
        push: {
            title: "New Department Assignment",
            body: "You have been assigned to the **{{departmentName}}** department by **{{performedByName}}**.",
            data: { type: "staff.assigned", departmentId: "{{departmentId}}" }
        },
        inApp: {
            title: "Department Assignment",
            body: "You have been assigned to the **{{departmentName}}** department by **{{performedByName}}**."
        }
    },
    "staff.role_changed": {
        push: {
            title: "Role Updated",
            body: "Your role in **{{departmentName}}** has been updated to **{{role}}** by **{{performedByName}}**.",
            data: { type: "staff.role_changed", departmentId: "{{departmentId}}", role: "{{role}}" }
        },
        inApp: {
            title: "Role Updated",
            body: "Your role in **{{departmentName}}** has been updated to **{{role}}** by **{{performedByName}}**."
        }
    },
    "staff.suspended": {
        push: {
            title: "Staff Suspension",
            body: "Your access to **{{departmentName}}** has been suspended by **{{performedByName}}**.",
            data: { type: "staff.suspended", departmentId: "{{departmentId}}" },
            metadata: { priority: "high" }
        },
        inApp: {
            title: "Staff Suspension",
            body: "Your access to **{{departmentName}}** has been suspended by **{{performedByName}}**."
        }
    },
    "staff.removed": {
        push: {
            title: "Staff Removal",
            body: "You have been removed from the **{{departmentName}}** department by **{{performedByName}}**.",
            data: { type: "staff.removed", departmentId: "{{departmentId}}" },
            metadata: { priority: "high" }
        },
        inApp: {
            title: "Staff Removal",
            body: "You have been removed from the **{{departmentName}}** department by **{{performedByName}}**."
        }
    }
};

module.exports = templates;