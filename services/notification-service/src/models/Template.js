// src/models/Template.js
const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, enum: ['email', 'sms', 'push', 'inApp'], required: true },
    content: { type: String, required: true }, // Handlebars template string
    subject: { type: String }, // For email templates
    variables: { type: [String], default: [] }, // Expected vars like {{userName}}

    // Channel-specific metadata
    metadata: {
        // For push notifications
        pushConfig: {
            sound: { type: String, default: 'default' },
            badge: { type: Number },
            priority: { type: String, enum: ['normal', 'high'], default: 'normal' },
            category: { type: String }
        },
        // For SMS
        smsConfig: {
            maxLength: { type: Number, default: 160 },
            allowUnicode: { type: Boolean, default: true }
        },
        // For email
        emailConfig: {
            isHtml: { type: Boolean, default: true },
            priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' }
        }
    },

    // Template validation
    isActive: { type: Boolean, default: true },
    version: { type: String, default: '1.0.0' }
}, { timestamps: true });

// Compound index for efficient lookups by name and type
templateSchema.index({ name: 1, type: 1 }, { unique: true });

// Index for active templates
templateSchema.index({ isActive: 1 });

// Static method to find templates by name for all channels
templateSchema.statics.findByNameAndChannels = async function(templateName, channels) {
    const enabledChannels = Object.keys(channels).filter(channel => channels[channel]);

    return this.find({
        name: templateName,
        type: { $in: enabledChannels },
        isActive: true
    });
};

// Static method to validate template exists for channels
templateSchema.statics.validateTemplatesExist = async function(templateName, channels) {
    const enabledChannels = Object.keys(channels).filter(channel => channels[channel]);
    const existingTemplates = await this.find({
        name: templateName,
        type: { $in: enabledChannels },
        isActive: true
    }).select('type');

    const existingTypes = existingTemplates.map(t => t.type);
    const missingChannels = enabledChannels.filter(channel => !existingTypes.includes(channel));

    return {
        isValid: missingChannels.length === 0,
        missingChannels,
        existingChannels: existingTypes
    };
};

// Instance method to validate template content
templateSchema.methods.validateContent = function() {
    const errors = [];

    if (this.type === 'email' && !this.subject) {
        errors.push('Email templates must have a subject');
    }

    if (this.type === 'sms' && this.content.length > (this.metadata?.smsConfig?.maxLength || 160)) {
        errors.push(`SMS template content exceeds maximum length of ${this.metadata?.smsConfig?.maxLength || 160} characters`);
    }

    if (this.type === 'push') {
        try {
            JSON.parse(this.content);
        } catch (e) {
            errors.push('Push template content must be valid JSON');
        }
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

module.exports = mongoose.model('Template', templateSchema);