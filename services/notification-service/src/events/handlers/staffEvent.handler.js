"use strict";

const logger = require("../../utils/logger");

/**
 * Handles staff management events (mostly department_user events)
 * @param {Object} event - The staff event
 * @param {string} routingKey - Event routing key
 */
module.exports = async function handleStaffEvent(event, routingKey) {
    try {
        const { type, data } = event;

        logger.info(`👥 Processing staff event: ${type}`, data);

        switch (type) {
            case "department_user.assigned":
                await handleStaffAssigned(data);
                break;

            case "department_user.role_changed":
                await handleStaffRoleChanged(data);
                break;

            case "department_user.suspended":
                await handleStaffSuspended(data);
                break;

            case "department_user.removed":
                await handleStaffRemoved(data);
                break;

            default:
                logger.warn(`⚠️ Unhandled staff event type: ${type}`);
        }
    } catch (error) {
        const errorMsg = error && typeof error === 'object' ? (error.message || JSON.stringify(error)) : String(error);
        logger.error(`❌ Error handling staff event: ${errorMsg}`);
        throw error;
    }
};

/**
 * Handle staff assigned to department
 */
async function handleStaffAssigned(data) {
    const { userId, departmentId, companyId, role, performedByName, departmentName } = data;

    try {
        const { dispatchEvent } = require("../../services/dispatcher");

        await dispatchEvent({
            event: "department_user.assigned",
            data: {
                departmentName: departmentName || "New Department",
                performedByName: performedByName || "Admin",
                role,
                ...data
            },
            recipients: [userId],
            companyId,
            templateName: "staff.department_assigned",
            channels: ["push", "inApp"]
        });

        logger.info(`✅ Staff assignment notification sent to user ${userId}`);
    } catch (error) {
        logger.error("❌ Error processing staff assignment notification:", error);
    }
}

/**
 * Handle staff role changed
 */
async function handleStaffRoleChanged(data) {
    const { userId, departmentId, companyId, role, performedByName, departmentName } = data;

    try {
        const { dispatchEvent } = require("../../services/dispatcher");

        await dispatchEvent({
            event: "department_user.role_changed",
            data: {
                departmentName: departmentName || "Department",
                performedByName: performedByName || "Admin",
                role,
                ...data
            },
            recipients: [userId],
            companyId,
            templateName: "staff.role_changed",
            channels: ["push", "inApp"]
        });

        logger.info(`✅ Staff role change notification sent to user ${userId}`);
    } catch (error) {
        logger.error("❌ Error processing staff role change notification:", error);
    }
}

/**
 * Handle staff suspended
 */
async function handleStaffSuspended(data) {
    const { userId, departmentId, companyId, performedByName, departmentName } = data;

    try {
        const { dispatchEvent } = require("../../services/dispatcher");

        await dispatchEvent({
            event: "department_user.suspended",
            data: {
                departmentName: departmentName || "Department",
                performedByName: performedByName || "Admin",
                ...data
            },
            recipients: [userId],
            companyId,
            templateName: "staff.suspended",
            channels: ["push", "inApp"]
        });

        logger.info(`✅ Staff suspension notification sent to user ${userId}`);
    } catch (error) {
        logger.error("❌ Error processing staff suspension notification:", error);
    }
}

/**
 * Handle staff removed
 */
async function handleStaffRemoved(data) {
    const { userId, departmentId, companyId, performedByName, departmentName } = data;

    try {
        const { dispatchEvent } = require("../../services/dispatcher");

        await dispatchEvent({
            event: "department_user.removed",
            data: {
                departmentName: departmentName || "Department",
                performedByName: performedByName || "Admin",
                ...data
            },
            recipients: [userId],
            companyId,
            templateName: "staff.removed",
            channels: ["push", "inApp"]
        });

        logger.info(`✅ Staff removal notification sent to user ${userId}`);
    } catch (error) {
        logger.error("❌ Error processing staff removal notification:", error);
    }
}
