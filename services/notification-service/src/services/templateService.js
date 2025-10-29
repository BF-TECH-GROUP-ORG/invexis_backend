// src/services/templateService.js
const Handlebars = require('handlebars');
const Template = require('../models/Template');
const logger = require('../utils/logger');

const compileTemplate = async (templateName, payload) => {
    try {
        const template = await Template.findOne({ name: templateName });
        if (!template) {
            logger.warn(`Template ${templateName} not found`);
            return { title: 'Default Title', body: 'Default Body' };
        }

        const hbsTemplate = Handlebars.compile(template.content);
        const rendered = hbsTemplate(payload);

        return {
            title: payload.title || 'Notification',
            body: rendered
        };
    } catch (error) {
        logger.error('Template compilation error:', error);
        return { title: 'Error', body: 'Notification failed to render' };
    }
};

module.exports = { compileTemplate };