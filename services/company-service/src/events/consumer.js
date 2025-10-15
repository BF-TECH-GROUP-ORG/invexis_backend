const { getChannel } = require("../config/rabbitmq");
const Company = require("../models/company.model");

/**
 * Handle incoming events from other services
 */
const consumeEvents = async () => {
  try {
    const channel = getChannel();
    if (!channel) {
      console.warn(
        "RabbitMQ channel not available, skipping event consumer setup"
      );
      return;
    }

    // Consume events from auth service (e.g., user deletions)
    channel.consume(
      "auth_events",
      async (msg) => {
        if (msg) {
          try {
            const event = JSON.parse(msg.content.toString());
            console.log("📥 Received event from auth-service:", event.type);

            await handleAuthEvent(event);
            channel.ack(msg);
          } catch (error) {
            console.error("Error processing auth event:", error);
            channel.nack(msg, false, false); // Don't requeue on error
          }
        }
      },
      { noAck: false }
    );

    // Consume events from payment/billing service
    channel.consume(
      "payment_events",
      async (msg) => {
        if (msg) {
          try {
            const event = JSON.parse(msg.content.toString());
            console.log("📥 Received event from payment-service:", event.type);

            await handlePaymentEvent(event);
            channel.ack(msg);
          } catch (error) {
            console.error("Error processing payment event:", error);
            channel.nack(msg, false, false);
          }
        }
      },
      { noAck: false }
    );

    console.log("✅ Event consumers initialized");
  } catch (error) {
    console.error("Failed to set up event consumers:", error);
  }
};

/**
 * Handle events from auth service
 */
const handleAuthEvent = async (event) => {
  switch (event.type) {
    case "user.deleted":
      // Handle user deletion - remove from company_users
      console.log("Handling user deletion:", event.data.userId);
      // TODO: Implement CompanyUser cleanup
      break;

    case "user.suspended":
      // Handle user suspension
      console.log("Handling user suspension:", event.data.userId);
      break;

    default:
      console.log("Unhandled auth event type:", event.type);
  }
};

/**
 * Handle events from payment service
 */
const handlePaymentEvent = async (event) => {
  switch (event.type) {
    case "payment.success":
      // Update subscription status
      console.log("Handling successful payment:", event.data);
      // TODO: Update subscription based on payment
      break;

    case "payment.failed":
      // Handle failed payment
      console.log("Handling failed payment:", event.data);
      break;

    case "subscription.expired":
      // Handle subscription expiration
      console.log("Handling subscription expiration:", event.data);
      break;

    default:
      console.log("Unhandled payment event type:", event.type);
  }
};

module.exports = consumeEvents;
