"use strict";

module.exports = async function handleAuthEvent(event) {
  switch (event.type) {
    case "user.deleted":
      console.log(`⚙️ User deleted: ${event.data.userId}`);
      // TODO: Clean up related company-user records
      break;

    case "user.suspended":
      console.log(`⚙️ User suspended: ${event.data.userId}`);
      // TODO: Update status in local DB
      break;

    default:
      console.log(`⚠️ Unhandled auth event type: ${event.type}`);
  }
};
