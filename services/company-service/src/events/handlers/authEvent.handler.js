"use strict";
const CompanyUserController = require("../../controllers/companyUserController");

module.exports = async function handleAuthEvent(event) {
  switch (event.type) {
    case "user.created":
      await CompanyUserController.assignUserToCompany(event.data.userId)
      break;
    case "user.deleted":
      
      console.log(`⚙️ User deleted: ${event.data.userId}`);
      await CompanyUserController.removeUserFromCompany(event.data.userId,event.data.companyId)
      // TODO: Clean up related company-user records
      break;

    case "user.suspended":
      console.log(`⚙️ User suspended: ${event.data.userId}`);
      await CompanyUserController.suspendUser(event.data.userId,event.data.companyId)
      break;
    case "user.suspendedAll":
      console.log(`⚙️ All User suspended: ${event.data.userId}`);
      await CompanyUserController.suspendAllUsersFromCompany(event.data.companyId);

    default:
      console.log(`⚠️ Unhandled auth event type: ${event.type}`);
  }
};
