"use strict";
const CompanyUser = require("../../models/companyUser.model");
const Role = require("../../models/role.model");
const User = require("../../models/user.model");

/**
 * Handles authentication and user lifecycle events from auth-service
 * Manages company-user relationships and user status changes
 * @param {Object} event - The auth event
 */
module.exports = async function handleAuthEvent(event) {
  try {
    const type = event.type || event.event;
    const data = event.data;

    console.log(`🔐 Processing auth event: ${type}`, data);

    switch (type) {
      case "user.created":
        await handleUserCreated(data);
        break;

      case "user.updated":
        await handleUserUpdated(data);
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

      case "auth.worker_removal_requested":
        await handleWorkerRemovalRequested(data);
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
  const { userId, companies, role } = data;

  if (!userId) {
    console.warn("⚠️ User created event missing userId");
    return;
  }

  try {
    // First, sync user data to local users table
    await User.upsert(data);
    console.log(`✅ User ${userId} data synced to local database`);

    // Then handle company assignment if applicable
    if (!companies || companies.length === 0) {
      console.log(`ℹ️ User ${userId} has no companies assigned, skipping company-user creation`);
      return;
    }

    console.log(`👤 New user created: ${userId}, Role: ${role}, Companies: ${companies}`);

    for (const companyId of companies) {
      // Find role ID for the company
      let roleRecord = await Role.findByName(companyId, role);

      if (!roleRecord) {
        console.warn(`⚠️ Role '${role}' not found for company ${companyId}. Skipping assignment.`);
        continue;
      }

      // Check if already assigned
      const existing = await CompanyUser.findByUserAndCompany(userId, companyId);
      if (existing) {
        console.log(`ℹ️ User ${userId} already assigned to company ${companyId}`);
        continue;
      }

      await CompanyUser.assign({
        company_id: companyId,
        user_id: userId,
        role_id: roleRecord.id,
        createdBy: 'system',
      });
      console.log(`✅ User ${userId} assigned to company ${companyId} with role ${role}`);
    }

  } catch (error) {
    console.error(`❌ Error assigning user ${userId}:`, error.message);
    throw error;
  }
}

/**
 * Handle user update event
 * Sync updated user data to local replica
 */
async function handleUserUpdated(data) {
  const { userId } = data;

  if (!userId) {
    console.warn("⚠️ User updated event missing userId");
    return;
  }

  try {
    await User.upsert(data);
    console.log(`✅ User ${userId} data updated in local database`);
  } catch (error) {
    console.error(`❌ Error updating user ${userId}:`, error.message);
    throw error;
  }
}

/**
 * Handle user deletion event
 * Remove user from all company-user relationships and local database
 */
async function handleUserDeleted(data) {
  const { userId, companyId } = data;

  if (!userId) {
    console.warn("⚠️ User deleted event missing userId");
    return;
  }

  try {
    console.log(`🗑️ User deleted: ${userId}`);

    // Remove from company assignments
    if (companyId) {
      await CompanyUser.remove(companyId, userId);
      console.log(`✅ User ${userId} removed from company ${companyId}`);
    } else {
      const userCompanies = await CompanyUser.findByUser(userId);
      for (const uc of userCompanies) {
        await CompanyUser.remove(uc.company_id, userId);
      }
      console.log(`✅ User ${userId} removed from all companies`);
    }

    // Remove from local users table
    await User.delete(userId);
    console.log(`✅ User ${userId} removed from local database`);
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
    await CompanyUser.suspend(companyId, userId, 'system');
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
    const users = await CompanyUser.findByCompany(companyId);
    for (const user of users) {
      await CompanyUser.suspend(companyId, user.user_id, 'system');
    }
    console.log(`✅ All users suspended from company ${companyId}`);
  } catch (error) {
    console.error(
      `❌ Error suspending all users from company ${companyId}:`,
      error.message
    );
    throw error;
  }
}

/**
 * Handle worker removal from company
 * Remove user from all departments in company and emit event back to auth-service
 */
async function handleWorkerRemovalRequested(data) {
  const { workerId, companyId, requestedBy } = data;

  if (!workerId || !companyId) {
    console.warn("⚠️ Worker removal event missing workerId or companyId");
    return;
  }

  try {
    const DepartmentUser = require("../../models/departmentUser.model");

    console.log(`🗑️ Worker removal requested: ${workerId} from company ${companyId}`);

    // Get all departments user is in (for this company)
    const departments = await DepartmentUser.findByUserAndCompany(workerId, companyId);

    if (departments.length === 0) {
      console.log(`ℹ️ User ${workerId} has no department assignments in company ${companyId}`);
    } else {
      // Remove from all departments
      for (const dept of departments) {
        await DepartmentUser.remove(workerId, dept.department_id);
      }
      console.log(`✅ User ${workerId} removed from ${departments.length} departments in company ${companyId}`);
    }

    // Emit event to confirm removal (for audit/sync)
    try {
      const rabbitmq = require('/app/shared/rabbitmq.js');
      await rabbitmq.publish({
        exchange: 'events_topic',
        routingKey: 'company.worker_removal_completed',
        content: {
          type: 'company.worker_removal_completed',
          payload: {
            workerId,
            companyId,
            departmentsRemoved: departments.length,
            completedAt: new Date().toISOString(),
            completedBy: 'company-service'
          }
        }
      });
      console.log(`✅ Published worker removal completed event`);
    } catch (error) {
      console.warn(`⚠️ Could not publish removal completed event:`, error.message);
    }

  } catch (error) {
    console.error(`❌ Error handling worker removal: ${error.message}`);
    throw error;
  }
}
