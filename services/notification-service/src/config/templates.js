// src/config/templates.js

const fs = require('fs');
const path = require('path');

// Load template files
const loadTemplate = (filename) => {
    try {
        const templatePath = path.join(__dirname, '../../templates/email', filename);
        console.log(`Loading template from: ${templatePath}`);
        return fs.readFileSync(templatePath, 'utf-8');
    } catch (error) {
        console.error(`Failed to load template ${filename}:`, error.message);
        return null;
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
            content: 'Welcome to {{companyName}}, {{userName}}! Verify your account: {{actionUrl}}',
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
    }
};

module.exports = templates;
