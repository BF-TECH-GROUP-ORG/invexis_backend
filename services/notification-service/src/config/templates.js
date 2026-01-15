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
    welcome: {
        email: {
            subject: 'Welcome to {{companyName}}!',
            content: loadTemplate('welcome.html'),
            metadata: {
                priority: 'normal'
            }
        },
        sms: {
            content: 'Welcome to {{companyName}}, {{userName}}! Your temporary password is: {{password}}',
            metadata: {
                maxLength: 160
            }
        },
        push: {
            content: JSON.stringify({
                title: 'Welcome to {{companyName}}!',
                body: 'Hi {{userName}}, tap to complete your setup',
                data: {
                    action: 'open_welcome',
                    url: '{{actionUrl}}'
                }
            }),
            metadata: {
                sound: 'default'
            }
        },
        inApp: {
            subject: 'Welcome to {{companyName}}!',
            content: 'Hi {{userName}}, welcome to {{companyName}}! Click here to complete your setup.'
        }
    },

    welcome_manual: {
        email: {
            subject: 'Welcome to {{companyName}}!',
            content: loadTemplate('welcome.html'), // Reuse HTML, but ensure it handles empty password gracefully (Logic added to HTML)
            metadata: {
                priority: 'normal'
            }
        },
        sms: {
            content: 'Welcome to {{companyName}}, {{userName}}! We are excited to have you on board.',
            metadata: {
                maxLength: 160
            }
        },
        push: {
            content: JSON.stringify({
                title: 'Welcome to {{companyName}}!',
                body: 'Hi {{userName}}, welcome aboard!',
                data: {
                    action: 'open_welcome',
                    url: '{{actionUrl}}'
                }
            }),
            metadata: {
                sound: 'default'
            }
        },
        inApp: {
            subject: 'Welcome to {{companyName}}!',
            content: 'Hi {{userName}}, welcome to {{companyName}}!'
        }
    },

    stripe_onboarding: {
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

    sale_created: {
        email: {
            subject: 'Sale #{{saleId}} Confirmed',
            content: `
    < h2 > Sale Confirmed — #{ { saleId } }</h2 >
        <p>Hello,</p>
        <p>A new sale has been successfully created.</p>
        
        <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-radius: 5px;">
          <p><strong>Sale ID:</strong> #{{saleId}}</p>
          <p><strong>Amount:</strong> {{formatCurrency amount}}</p>
          <p><strong>Date:</strong> {{formatDate createdAt}}</p>
        </div>
        
        <p>Thank you for your business!</p>
        <p>— The {{companyName}} Team</p>
`,
            metadata: {
                priority: 'normal'
            }
        },
        sms: {
            content: 'Sale #{{saleId}} confirmed! Amount: {{amount}}. Thanks for your business!',
            metadata: {
                maxLength: 160
            }
        },
        push: {
            content: JSON.stringify({
                title: 'Sale #{{saleId}} Confirmed',
                body: 'New sale created for {{amount}}',
                data: {
                    action: 'open_sale',
                    saleId: '{{saleId}}'
                }
            }),
            metadata: {
                sound: 'default'
            }
        },
        inApp: {
            subject: 'Sale #{{saleId}} Created',
            content: 'New sale #{{saleId}} created for {{amount}}'
        }
    },

    order_notification: {
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
            content: JSON.stringify({
                title: 'Order {{orderId}} confirmed',
                body: 'Your order total is {{orderTotal}}'
            })
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
            content: JSON.stringify({
                title: 'Verification Code',
                body: 'Your OTP: {{otp}}. Valid for {{expiryMinutes}} minutes',
                data: {
                    action: 'otp',
                    otp: '{{otp}}'
                }
            }),
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

    sale_return: {
        email: {
            subject: 'Return Initiated for Sale #{{saleId}}',
            content: `
                <h2>Return Initiated — Sale #{{saleId}}</h2>
                <p>Hello,</p>
                <p>A return has been initiated for sale #{{saleId}}.</p>
                <div style="margin: 20px 0; padding: 15px; background-color: #fce4e4; border-radius: 5px;">
                  <p><strong>Reason:</strong> {{reason}}</p>
                  <p><strong>Refund Amount:</strong> {{formatCurrency refundAmount}}</p>
                </div>
                <p>— The {{companyName}} Team</p>
            `,
            metadata: { priority: 'normal' }
        },
        push: {
            content: JSON.stringify({
                title: 'Return Initiated',
                body: 'Return for sale #{{saleId}} initiated: {{formatCurrency refundAmount}}',
                data: { action: 'open_return', saleId: '{{saleId}}', returnId: '{{returnId}}' }
            })
        },
        inApp: {
            subject: 'Return Initiated',
            content: 'Return for sale #{{saleId}} initiated for {{formatCurrency refundAmount}}'
        }
    },

    // --- PRODUCT & INVENTORY ---
    product_created: {
        inApp: {
            subject: 'New Product Added',
            content: 'New product **{{productName}}** added by {{userName}}.'
        },
        push: {
            content: JSON.stringify({
                title: 'New Product',
                body: '{{productName}} was added to inventory.',
                data: { action: 'open_product', productId: '{{productId}}' }
            })
        }
    },

    // Low Stock Alert Template
    low_stock_alert: {
        email: {
            subject: '⚠️ Low Stock Alert: {{productName}}',
            content: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 20px 0;">
                        <h2 style="color: #856404; margin: 0 0 15px 0;">⚠️ Low Stock Alert</h2>
                        <p style="font-size: 16px; color: #333; margin: 10px 0;">
                            <strong>Product:</strong> {{productName}}
                        </p>
                        {{#if sku}}
                        <p style="font-size: 14px; color: #666; margin: 5px 0;">
                            <strong>SKU:</strong> {{sku}}
                        </p>
                        {{/if}}
                        <div style="background-color: #fff; padding: 15px; border-radius: 5px; margin: 15px 0;">
                            <p style="margin: 5px 0;"><strong>Current Stock:</strong> <span style="color: #dc3545; font-size: 18px;">{{currentStock}}</span> units</p>
                            <p style="margin: 5px 0;"><strong>Threshold:</strong> {{threshold}} units</p>
                            {{#if percentageOfThreshold}}
                            <p style="margin: 5px 0;"><strong>Stock Level:</strong> {{percentageOfThreshold}}% of threshold</p>
                            {{/if}}
                            {{#if suggestedReorderQty}}
                            <p style="margin: 5px 0;"><strong>Suggested Reorder:</strong> {{suggestedReorderQty}} units</p>
                            {{/if}}
                        </div>
                        <p style="color: #856404; font-weight: bold; margin: 15px 0 0 0;">
                            ⚡ Action Required: Please restock soon to avoid stockouts.
                        </p>
                    </div>
                </div>
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
    out_of_stock_alert: {
        email: {
            subject: '🚨 URGENT: {{productName}} is Out of Stock',
            content: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 20px; margin: 20px 0;">
                        <h2 style="color: #721c24; margin: 0 0 15px 0;">🚨 URGENT: Out of Stock Alert</h2>
                        <p style="font-size: 18px; color: #333; margin: 10px 0; font-weight: bold;">
                            Product: {{productName}}
                        </p>
                        {{#if sku}}
                        <p style="font-size: 14px; color: #666; margin: 5px 0;">
                            <strong>SKU:</strong> {{sku}}
                        </p>
                        {{/if}}
                        <div style="background-color: #fff; padding: 15px; border-radius: 5px; margin: 15px 0;">
                            <p style="margin: 5px 0; color: #dc3545; font-size: 20px; font-weight: bold;">
                                Current Stock: 0 units
                            </p>
                            <p style="margin: 5px 0;"><strong>Threshold:</strong> {{threshold}} units</p>
                        </div>
                        <p style="color: #721c24; font-weight: bold; margin: 15px 0 0 0; font-size: 16px;">
                            🚨 IMMEDIATE ACTION REQUIRED: This product is completely out of stock!
                        </p>
                    </div>
                </div>
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

    // Legacy templates (kept for backward compatibility)
    inventory_low: {
        email: {
            subject: 'Low Stock Alert: {{productName}}',
            content: `<p>⚠️ <strong>Low Stock Alert</strong></p><p>Product <strong>{{productName}}</strong> is running low. Current quantity: <strong>{{quantity}}</strong>.</p><p>Please restock soon to avoid stockouts.</p>`,
            metadata: { priority: 'high' }
        },
        inApp: {
            subject: 'Low Stock Alert',
            content: '⚠️ Low stock: **{{productName}}** is down to {{quantity}} units.'
        },
        push: {
            content: JSON.stringify({
                title: 'Low Stock Alert',
                body: '{{productName}} is low ({{quantity}} left).',
                data: { action: 'open_inventory', productId: '{{productId}}' }
            }),
            metadata: { priority: 'high' }
        }
    },
    stock_out: {
        email: {
            subject: 'STOCK OUT: {{productName}}',
            content: `<p>🚨 <strong>STOCK OUT ALERT</strong></p><p>Product <strong>{{productName}}</strong> is now out of stock!</p>`,
            metadata: { priority: 'high' }
        },
        inApp: {
            subject: 'Stock Out Alert',
            content: '🚨 Stock out: **{{productName}}** is now out of stock!'
        },
        push: {
            content: JSON.stringify({
                title: 'Stock Out',
                body: '🚨 {{productName}} is out of stock!',
                data: { action: 'open_inventory', productId: '{{productId}}' }
            }),
            metadata: { priority: 'high' }
        }
    },

    // --- DEBTS ---
    debt_created: {
        sms: {
            content: 'Hello {{customerName}}, you have a new debt of {{formatCurrency amount}} at {{companyName}} for {{items}}. Total due: {{formatCurrency totalDebt}}. Please pay soon.',
            metadata: { maxLength: 160 }
        },
        inApp: {
            subject: 'New Debt Recorded',
            content: 'New debt of **{{formatCurrency amount}}** recorded for customer **{{customerName}}** by {{staffName}}.'
        },
        push: {
            content: JSON.stringify({
                title: 'New Debt Recorded',
                body: 'Debt of {{formatCurrency amount}} for {{customerName}}.',
                data: { action: 'open_debt', debtId: '{{debtId}}' }
            })
        }
    },
    debt_paid: {
        sms: {
            content: 'Thank you {{customerName}}! We received {{formatCurrency amount}}. Remaining balance: {{formatCurrency remainingBalance}}.',
            metadata: { maxLength: 160 }
        },
        inApp: {
            subject: 'Debt Payment Received',
            content: 'Debt payment of **{{formatCurrency amount}}** received from **{{customerName}}**.'
        },
        push: {
            content: JSON.stringify({
                title: 'Debt Payment',
                body: 'Received {{formatCurrency amount}} from {{customerName}}.',
                data: { action: 'open_debt', debtId: '{{debtId}}' }
            })
        }
    },

    // --- PAYMENTS ---
    payment_received: {
        inApp: {
            subject: 'Payment Received',
            content: 'Payment of **{{formatCurrency amount}}** received from **{{customerName}}** ({{paymentMethod}}).'
        },
        push: {
            content: JSON.stringify({
                title: 'Payment Received',
                body: 'Received {{formatCurrency amount}} via {{paymentMethod}}',
                data: { action: 'open_payment', paymentId: '{{paymentId}}' }
            })
        }
    },

    // --- SUBSCRIPTIONS ---
    subscription_expiring: {
        email: {
            subject: 'Action Required: Your Subscription is Expiring Soon',
            content: `<p>Hello,</p><p>Your subscription for {{companyName}} will expire on {{formatDate expiryDate 'long'}}.</p><p>Please renew now to avoid service interruption.</p>`,
            metadata: { priority: 'high' }
        },
        inApp: {
            subject: 'Subscription Expiring',
            content: 'Your subscription expires on {{formatDate expiryDate "short"}}. Renew now to maintain access.'
        },
        push: {
            content: JSON.stringify({
                title: 'Subscription Expiring',
                body: 'Renew by {{formatDate expiryDate "short"}} to keep using Invexis.',
            }),
            metadata: { priority: 'high' }
        }
    },
    subscription_expired: {
        email: {
            subject: 'Service Suspended: Subscription Expired',
            content: `<p>Hello,</p><p>Your subscription has expired. Access to premium features has been suspended.</p><p>Please renew immediately to restore access.</p>`,
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
            content: '🚨 Your subscription has expired. Please renew to restore services.'
        }
    }
};

module.exports = templates;
