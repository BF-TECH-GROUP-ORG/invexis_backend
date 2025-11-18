// src/services/templateService.js
const Handlebars = require("handlebars");
const Template = require("../models/Template");
const logger = require("../utils/logger");

// Register Handlebars helpers
Handlebars.registerHelper('formatDate', function(date, format) {
  if (!date) return '';
  const d = new Date(date);
  if (format === 'short') {
    return d.toLocaleDateString();
  } else if (format === 'long') {
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } else if (format === 'time') {
    return d.toLocaleTimeString();
  }
  return d.toISOString();
});

Handlebars.registerHelper('formatCurrency', function(amount, currency) {
  if (typeof amount !== 'number') return amount;
  const currencyCode = (typeof currency === 'string') ? currency : 'USD';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode
  }).format(amount);
});

Handlebars.registerHelper('truncate', function(str, length = 50) {
  if (!str || typeof str !== 'string') return str;
  return str.length > length ? str.substring(0, length) + '...' : str;
});

Handlebars.registerHelper('uppercase', function(str) {
  return str ? str.toString().toUpperCase() : '';
});

Handlebars.registerHelper('lowercase', function(str) {
  return str ? str.toString().toLowerCase() : '';
});

Handlebars.registerHelper('eq', function(a, b) {
  return a === b;
});

Handlebars.registerHelper('ne', function(a, b) {
  return a !== b;
});

Handlebars.registerHelper('gt', function(a, b) {
  return a > b;
});

Handlebars.registerHelper('lt', function(a, b) {
  return a < b;
});

Handlebars.registerHelper('and', function(a, b) {
  return a && b;
});

Handlebars.registerHelper('or', function(a, b) {
  return a || b;
});

Handlebars.registerHelper('default', function(value, defaultValue) {
  return value || defaultValue;
});

// Current year helper for copyright notices
Handlebars.registerHelper('currentYear', function() {
  return new Date().getFullYear();
});

/**
 * Compile templates for all enabled channels
 * @param {string} templateName - Name of the template
 * @param {object} payload - Data to compile template with
 * @param {object} channels - Enabled channels {email: true, sms: false, etc}
 * @returns {object} Compiled content for each channel
 */
const compileTemplatesForChannels = async (templateName, payload, channels) => {
  const enabledChannels = Object.keys(channels).filter(channel => channels[channel]);
  const compiledContent = {};

  try {
    // Fetch all templates for this name and enabled channels
    const templates = await Template.find({
      name: templateName,
      type: { $in: enabledChannels },
      isActive: true
    });

    if (templates.length === 0) {
      logger.warn(`No templates found for ${templateName} with channels: ${enabledChannels.join(', ')}`);
      return getDefaultContent(enabledChannels);
    }

    // Compile each template
    for (const template of templates) {
      try {
        const compiled = await compileTemplateForChannel(template, payload);
        compiledContent[template.type] = compiled;
      } catch (error) {
        logger.error(`Error compiling ${template.type} template for ${templateName}:`, error);
        compiledContent[template.type] = getDefaultContentForChannel(template.type);
      }
    }

    // Add default content for missing channels
    for (const channel of enabledChannels) {
      if (!compiledContent[channel]) {
        logger.warn(`Template ${templateName} missing for channel ${channel}, using default`);
        compiledContent[channel] = getDefaultContentForChannel(channel);
      }
    }

    return compiledContent;
  } catch (error) {
    logger.error("Template compilation error:", error);
    return getDefaultContent(enabledChannels);
  }
};

/**
 * Compile a single template for a specific channel
 * @param {object} template - Template document
 * @param {object} payload - Data to compile with
 * @returns {object} Compiled content for the channel
 */
const compileTemplateForChannel = async (template, payload) => {
  const hbsTemplate = Handlebars.compile(template.content);

  switch (template.type) {
    case 'email':
      return compileEmailTemplate(template, payload, hbsTemplate);
    case 'sms':
      return compileSmsTemplate(template, payload, hbsTemplate);
    case 'push':
      return compilePushTemplate(template, payload, hbsTemplate);
    case 'inApp':
      return compileInAppTemplate(template, payload, hbsTemplate);
    default:
      throw new Error(`Unknown template type: ${template.type}`);
  }
};

/**
 * Compile email template
 */
const compileEmailTemplate = (template, payload, hbsTemplate) => {
  const htmlContent = hbsTemplate(payload);
  const subject = template.subject ? Handlebars.compile(template.subject)(payload) :
                  payload.title || "Notification";

  return {
    subject,
    html: htmlContent,
    text: htmlContent.replace(/<[^>]*>/g, ''), // Strip HTML for text version
    priority: template.metadata?.emailConfig?.priority || 'normal'
  };
};

/**
 * Compile SMS template
 */
const compileSmsTemplate = (template, payload, hbsTemplate) => {
  const message = hbsTemplate(payload);
  const maxLength = template.metadata?.smsConfig?.maxLength || 160;

  return {
    message: message.length > maxLength ? message.substring(0, maxLength - 3) + '...' : message,
    maxLength,
    allowUnicode: template.metadata?.smsConfig?.allowUnicode || true
  };
};

/**
 * Compile push notification template
 */
const compilePushTemplate = (template, payload, hbsTemplate) => {
  try {
    // Push templates are stored as JSON strings
    const jsonTemplate = JSON.parse(template.content);
    const compiled = {};

    // Compile each field in the JSON template
    for (const [key, value] of Object.entries(jsonTemplate)) {
      if (typeof value === 'string') {
        compiled[key] = Handlebars.compile(value)(payload);
      } else if (typeof value === 'object' && value !== null) {
        compiled[key] = compileObjectTemplate(value, payload);
      } else {
        compiled[key] = value;
      }
    }

    return {
      ...compiled,
      sound: template.metadata?.pushConfig?.sound || 'default',
      badge: template.metadata?.pushConfig?.badge,
      priority: template.metadata?.pushConfig?.priority || 'normal',
      category: template.metadata?.pushConfig?.category
    };
  } catch (error) {
    logger.error('Error parsing push template JSON:', error);
    return {
      title: payload.title || "Notification",
      body: hbsTemplate(payload),
      sound: 'default',
      priority: 'normal'
    };
  }
};

/**
 * Compile in-app notification template
 */
const compileInAppTemplate = (template, payload, hbsTemplate) => {
  const body = hbsTemplate(payload);
  const title = payload.title || template.subject || "Notification";

  return {
    title,
    body,
    data: payload,
    actionUrl: payload.actionUrl,
    imageUrl: payload.imageUrl
  };
};

/**
 * Recursively compile object templates
 */
const compileObjectTemplate = (obj, payload) => {
  const compiled = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      compiled[key] = Handlebars.compile(value)(payload);
    } else if (typeof value === 'object' && value !== null) {
      compiled[key] = compileObjectTemplate(value, payload);
    } else {
      compiled[key] = value;
    }
  }
  return compiled;
};

/**
 * Get default content for missing templates
 */
const getDefaultContent = (channels) => {
  const content = {};
  for (const channel of channels) {
    content[channel] = getDefaultContentForChannel(channel);
  }
  return content;
};

/**
 * Get default content for a specific channel
 */
const getDefaultContentForChannel = (channel) => {
  switch (channel) {
    case 'email':
      return {
        subject: "Notification",
        html: "<p>You have a new notification.</p>",
        text: "You have a new notification.",
        priority: 'normal'
      };
    case 'sms':
      return {
        message: "You have a new notification.",
        maxLength: 160,
        allowUnicode: true
      };
    case 'push':
      return {
        title: "Notification",
        body: "You have a new notification.",
        sound: 'default',
        priority: 'normal'
      };
    case 'inApp':
      return {
        title: "Notification",
        body: "You have a new notification.",
        data: {}
      };
    default:
      return {
        title: "Notification",
        body: "You have a new notification."
      };
  }
};

// Legacy function for backward compatibility
const compileTemplate = async (templateName, payload) => {
  logger.warn('compileTemplate is deprecated, use compileTemplatesForChannels instead');
  const templates = await compileTemplatesForChannels(templateName, payload, { inApp: true });
  const inAppContent = templates.inApp || getDefaultContentForChannel('inApp');
  return {
    title: inAppContent.title,
    body: inAppContent.body
  };
};

module.exports = {
  compileTemplatesForChannels,
  compileTemplateForChannel,
  compileTemplate // Keep for backward compatibility
};
