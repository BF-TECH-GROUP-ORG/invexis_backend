"use strict";
const CompanyUserController = require("../../controllers/companyUserController");

/**
 * Handles authentication and user lifecycle events from auth-service
 * Manages company-user relationships and user status changes
 * @param {Object} event - The auth event
 */
module.exports = async function handleAuthEvent(event) {
  try {
    const { type, data } = event;

    console.log(`🔐 Processing auth event: ${type}`, data);

    switch (type) {
      case "user.created":
        await handleUserCreated(data);
        break;

      case "user.deleted":
        await handleUserDeleted(data);
        break;

      case "user.suspended":
        await handleUserSuspended(data);
        break;

      case "user.suspendedAll":
        await handleAllUsersSuspended(data);
        break;

      default:
        console.log(`⚠️ Unhandled auth event type: ${type}`);
    }
  } catch (error) {
    console.error(`❌ Error handling auth event: ${error.message}`);
    throw error;
  }
};

/**
 * Handle user creation event
 * Assign newly created user to their company
 */
async function handleUserCreated(data) {
  const { userId } = data;

  if (!userId) {
    console.warn("⚠️ User created event missing userId");
    return;
  }

  try {
    console.log(`👤 New user created: ${userId}`);
    await CompanyUserController.assignUserToCompany(userId);
    console.log(`✅ User ${userId} assigned to company`);
  } catch (error) {
    console.error(`❌ Error assigning user ${userId}:`, error.message);
    throw error;
  }
}

/**
 * Handle user deletion event
 * Remove user from all company-user relationships
 */
async function handleUserDeleted(data) {
  const { userId, companyId } = data;

  if (!userId) {
    console.warn("⚠️ User deleted event missing userId");
    return;
  }

  try {
    console.log(`🗑️ User deleted: ${userId}`);
    await CompanyUserController.removeUserFromCompany(userId, companyId);
    console.log(`✅ User ${userId} removed from company relationships`);
  } catch (error) {
    console.error(`❌ Error removing user ${userId}:`, error.message);
    throw error;
  }
}

/**
 * Handle user suspension event
 * Suspend a specific user from a company
 */
async function handleUserSuspended(data) {
  const { userId, companyId } = data;

  if (!userId || !companyId) {
    console.warn("⚠️ User suspended event missing userId or companyId");
    return;
  }

  try {
    console.log(`⏸️ User suspended: ${userId} from company ${companyId}`);
    await CompanyUserController.suspendUser(userId, companyId);
    console.log(`✅ User ${userId} suspended from company ${companyId}`);
  } catch (error) {
    console.error(`❌ Error suspending user ${userId}:`, error.message);
    throw error;
  }
}

/**
 * Handle all users suspension event
 * Suspend all users from a company
 */
async function handleAllUsersSuspended(data) {
  const { companyId } = data;

  if (!companyId) {
    console.warn("⚠️ All users suspended event missing companyId");
    return;
  }

  try {
    console.log(`⏸️ All users suspended from company: ${companyId}`);
    await CompanyUserController.suspendAllUsersFromCompany(companyId);
    console.log(`✅ All users suspended from company ${companyId}`);
  } catch (error) {
    console.error(
      `❌ Error suspending all users from company ${companyId}:`,
      error.message
    );
    throw error;
  }
}
