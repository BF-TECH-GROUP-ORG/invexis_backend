"use strict";

module.exports = async function handlePaymentEvent(event) {
  switch (event.type) {
    case "payment.subscription.success":
      console.log(`💰 Payment success: ${JSON.stringify(event.data)}`);
      // TODO: Activate or extend company subscription
      break;

    case "payment.subscription.failed":
      console.log(`❌ Payment failed: ${JSON.stringify(event.data)}`);
      // TODO: Send alert to company admin
      break;

    case "subscription.expired":
      console.log(`⌛ Subscription expired: ${JSON.stringify(event.data)}`);
      // TODO: Downgrade service tier
      break;

    default:
      console.log(`⚠️ Unhandled payment event type: ${event.type}`);
  }
};
